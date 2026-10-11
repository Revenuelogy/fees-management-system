"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { parseRupees, rupees } from "@/lib/format";
import { isUuid, text } from "../../helpers";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function done(studentId: string) {
  // A fee plan change moves expected / pending numbers everywhere.
  revalidatePath("/", "layout");
  revalidatePath(`/students/${studentId}/fees`);
}

async function audit(supabase: Supabase, action: string, entityId: string, details: Record<string, unknown>) {
  await supabase.rpc("audit", { p_action: action, p_entity: "student_charges", p_entity_id: entityId, p_details: details });
}

/** Money currently allocated to one charge (paise). */
async function allocatedTo(supabase: Supabase, chargeId: string): Promise<number> {
  const { data } = await supabase.from("allocations").select("amount").eq("charge_id", chargeId);
  return ((data ?? []) as { amount: number }[]).reduce((s, a) => s + Number(a.amount), 0);
}

function ids(formData: FormData) {
  const studentId = text(formData, "student_id");
  const chargeId = text(formData, "charge_id");
  return { studentId: isUuid(studentId) ? studentId : null, chargeId: isUuid(chargeId) ? chargeId : null };
}

export async function updateCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const { studentId, chargeId } = ids(formData);
  if (!studentId || !chargeId) return { error: "Unknown fee line." };
  const amount = parseRupees(text(formData, "amount"));
  const concession = parseRupees(text(formData, "concession") ?? "0");
  if (amount === null || amount < 0) return { error: "Enter a valid amount (₹)." };
  if (concession === null || concession < 0) return { error: "Enter a valid concession (₹)." };
  if (concession > amount) return { error: "Concession cannot be more than the amount." };

  const supabase = await createClient();
  const { data: line, error: loadError } = await supabase
    .from("student_charges")
    .select("id, amount, concession, source")
    .eq("id", chargeId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (loadError) return { error: friendlyError(loadError) };
  if (!line) return { error: "This fee line no longer exists." };
  const current = line as { amount: number; concession: number; source: string };
  if (Number(current.amount) === amount && Number(current.concession) === concession) return { ok: true, message: "No changes." };

  const paid = await allocatedTo(supabase, chargeId);
  const patch: Record<string, unknown> = { amount, concession };
  // A hand-edited amount must survive "re-generate from class structure" (which only touches 'structure' lines).
  if (Number(current.amount) !== amount && current.source === "structure") patch.source = "manual";

  const { error } = await supabase.from("student_charges").update(patch).eq("id", chargeId).eq("student_id", studentId);
  if (error) return { error: friendlyError(error) };
  await audit(supabase, "edit_charge", chargeId, {
    student: studentId,
    amount_from: current.amount,
    amount,
    concession_from: current.concession,
    concession,
  });
  done(studentId);
  const net = amount - concession;
  return {
    ok: true,
    message:
      paid > net
        ? `Saved. ${rupees(paid - net)} that was paid against this line moved to other dues (or advance).`
        : "Saved.",
  };
}

export async function deleteCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const { studentId, chargeId } = ids(formData);
  if (!studentId || !chargeId) return { error: "Unknown fee line." };

  const supabase = await createClient();
  const paid = await allocatedTo(supabase, chargeId);
  const { data, error } = await supabase
    .from("student_charges")
    .delete()
    .eq("id", chargeId)
    .eq("student_id", studentId)
    .select("amount, concession, fee_head_id, installment_id");
  if (error) return { error: friendlyError(error) };
  if (!data || data.length === 0) return { error: "This fee line no longer exists." };
  await audit(supabase, "delete_charge", chargeId, { student: studentId, ...(data[0] as Record<string, unknown>), paid });
  done(studentId);
  return {
    ok: true,
    message: paid > 0 ? `Line deleted. ${rupees(paid)} paid against it moved to other dues (or advance).` : "Line deleted.",
  };
}

export async function addCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const studentId = text(formData, "student_id");
  const installmentId = text(formData, "installment_id");
  const feeHeadId = text(formData, "fee_head_id");
  const amount = parseRupees(text(formData, "amount"));
  const concession = parseRupees(text(formData, "concession") ?? "0");
  const note = text(formData, "note");
  if (!isUuid(studentId)) return { error: "Unknown student." };
  if (!isUuid(installmentId)) return { error: "Choose an installment." };
  if (!isUuid(feeHeadId)) return { error: "Choose a fee head." };
  if (amount === null || amount <= 0) return { error: "Enter an amount greater than zero (₹)." };
  if (concession === null || concession < 0) return { error: "Enter a valid concession (₹)." };
  if (concession > amount) return { error: "Concession cannot be more than the amount." };

  const supabase = await createClient();
  const { data: inst } = await supabase.from("installments").select("session_id").eq("id", installmentId).maybeSingle();
  if (!inst) return { error: "That installment no longer exists." };

  const { data, error } = await supabase
    .from("student_charges")
    .insert({
      student_id: studentId,
      session_id: (inst as { session_id: string }).session_id,
      installment_id: installmentId,
      fee_head_id: feeHeadId,
      amount,
      concession,
      source: "manual",
      note,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "This installment already has a line for that fee head. Edit that line instead." };
    return { error: friendlyError(error) };
  }
  await audit(supabase, "add_charge", (data as { id: string }).id, { student: studentId, amount, concession });
  done(studentId);
  return { ok: true, message: `Added a ${rupees(amount)} line.` };
}

export async function applyConcession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  const feeHead = text(formData, "fee_head_id");
  const mode = text(formData, "mode");
  const from = Number(text(formData, "from_installment") ?? "1");
  if (!isUuid(studentId) || !isUuid(sessionId)) return { error: "Unknown student or session." };
  if (feeHead && !isUuid(feeHead)) return { error: "Choose a fee head." };
  if (mode !== "percent" && mode !== "amount" && mode !== "clear") return { error: "Choose how to apply the concession." };
  if (!Number.isInteger(from) || from < 1) return { error: "Choose the installment to start from." };

  let value = 0;
  if (mode === "percent") {
    const raw = text(formData, "value");
    const pct = raw === null ? NaN : Number(raw.replace("%", ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: "Enter a percentage between 0 and 100." };
    value = pct;
  } else if (mode === "amount") {
    const paise = parseRupees(text(formData, "value"));
    if (paise === null || paise < 0) return { error: "Enter the concession amount per installment line (₹)." };
    value = paise;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_concession", {
    p_student: studentId,
    p_session: sessionId,
    p_fee_head: feeHead,
    p_mode: mode,
    p_value: value,
    p_from_installment: from,
  });
  if (error) return { error: friendlyError(error) };
  done(studentId);
  const n = Number(data ?? 0);
  if (n === 0) return { ok: true, message: "No fee lines matched, so nothing changed." };
  const what =
    mode === "clear" ? "Concession cleared" : mode === "percent" ? `${value}% concession applied` : `${rupees(value)} concession applied`;
  return { ok: true, message: `${what} on ${n} fee ${n === 1 ? "line" : "lines"}.` };
}

export async function regenerateCharges(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  const overwrite = formData.get("overwrite") === "on";
  if (!isUuid(studentId) || !isUuid(sessionId)) return { error: "Unknown student or session." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("generate_charges", {
    p_session: sessionId,
    p_class: null,
    p_student: studentId,
    p_overwrite: overwrite,
  });
  if (error) return { error: friendlyError(error) };
  done(studentId);
  const n = Number(data ?? 0);
  return {
    ok: true,
    message: n === 0 ? "Already matches the class fee structure; nothing changed." : `${n} fee ${n === 1 ? "line" : "lines"} added or updated.`,
  };
}

export async function addOpeningDue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  const amount = parseRupees(text(formData, "amount"));
  const feeHead = text(formData, "fee_head") ?? "Previous Dues";
  const note = text(formData, "note");
  if (!isUuid(studentId)) return { error: "Unknown student." };
  if (!isUuid(sessionId)) return { error: "Choose the session the dues belong to." };
  if (amount === null || amount <= 0) return { error: "Enter an amount greater than zero (₹)." };

  const supabase = await createClient();
  const { data: session } = await supabase.from("academic_sessions").select("name").eq("id", sessionId).maybeSingle();
  const { data, error } = await supabase.rpc("add_opening_due", {
    p_student: studentId,
    p_session: sessionId,
    p_amount: amount,
    p_fee_head: feeHead,
    p_note: note,
  });
  if (error) return { error: friendlyError(error) };
  await audit(supabase, "add_opening_due", String(data ?? ""), { student: studentId, session: sessionId, amount, fee_head: feeHead });
  done(studentId);
  return {
    ok: true,
    message: `Added ${rupees(amount)} of ${feeHead} to ${(session as { name: string } | null)?.name ?? "the session"}.`,
    data: { sessionId },
  };
}
