"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { isIsoDate } from "../_lib/dates";
import { plural, listJoin } from "../_lib/text";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  // the session list feeds the top-bar switcher and every analysis page
  revalidatePath("/", "layout");
}

type InstallmentInput = { number: number; name: string; due_date: string };

export async function createSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const name = str(fd, "name");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  const copyFrom = str(fd, "copy_from") || null;
  const makeCurrent = fd.get("make_current") === "on";

  if (!name) return { error: "Enter a session name, for example 2027-28." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: "Enter valid start and end dates." };
  if (end <= start) return { error: "The end date must be after the start date." };

  let rows: { name?: unknown; due_date?: unknown }[];
  try {
    rows = JSON.parse(str(fd, "installments") || "[]");
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "Could not read the installment rows." };
  }
  if (rows.length === 0) return { error: "Add at least one installment." };
  const installments: InstallmentInput[] = [];
  for (const [i, r] of rows.entries()) {
    const due = String(r.due_date ?? "");
    if (!isIsoDate(due)) return { error: `Installment ${i + 1} needs a valid due date.` };
    installments.push({ number: i + 1, name: String(r.name ?? "").trim() || `Installment ${i + 1}`, due_date: due });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_session", {
    p_name: name,
    p_start: start,
    p_end: end,
    p_installments: installments,
    p_make_current: makeCurrent,
    p_copy_from: copyFrom,
  });
  if (error) return { error: friendlyError(error) };

  refresh();
  return {
    ok: true,
    message: `Session ${name} created with ${plural(installments.length, "installment")}${copyFrom ? ", fee structure copied" : ""}${
      makeCurrent ? " and marked as current" : ""
    }.`,
  };
}

export async function makeCurrent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "session_id");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_current_session", { p_session: id });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Marked as the current session." };
}

export async function updateSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "session_id");
  const name = str(fd, "name");
  const start = str(fd, "start_date");
  const end = str(fd, "end_date");
  if (!name) return { error: "Enter a session name." };
  if (!isIsoDate(start) || !isIsoDate(end)) return { error: "Enter valid start and end dates." };
  if (end <= start) return { error: "The end date must be after the start date." };
  const supabase = await createClient();
  const { error } = await supabase.from("academic_sessions").update({ name, start_date: start, end_date: end }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Session details saved." };
}

export async function deleteSession(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "session_id");
  const supabase = await createClient();
  const { data: session } = await supabase.from("academic_sessions").select("id, name").eq("id", id).maybeSingle();
  if (!session) return { error: "That session no longer exists." };

  // Deleting a session cascades to its enrolments, installments and charges, so refuse while it holds data.
  const [enr, pay, hint, chg] = await Promise.all([
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("session_id", id),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("session_hint_id", id),
    supabase.from("student_charges").select("id", { count: "exact", head: true }).eq("session_id", id),
  ]);
  const inUse: string[] = [];
  if (enr.count) inUse.push(plural(enr.count, "enrolment"));
  if ((pay.count ?? 0) + (hint.count ?? 0)) inUse.push(plural((pay.count ?? 0) + (hint.count ?? 0), "payment"));
  if (chg.count) inUse.push(plural(chg.count, "fee charge"));
  if (inUse.length) {
    return {
      error: `${session.name} cannot be deleted because it has ${listJoin(inUse)}. Sessions with students or payments are kept for history.`,
    };
  }

  const { error } = await supabase.from("academic_sessions").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: `Session ${session.name} deleted.` };
}

export async function saveInstallment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "installment_id");
  const intent = str(fd, "intent");
  const supabase = await createClient();

  if (intent === "delete") {
    const { data: inst } = await supabase.from("installments").select("id, number, name").eq("id", id).maybeSingle();
    if (!inst) return { error: "That installment no longer exists." };
    const [chg, hint] = await Promise.all([
      supabase.from("student_charges").select("id", { count: "exact", head: true }).eq("installment_id", id),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("installment_hint_id", id),
    ]);
    if (chg.count) {
      return {
        error: `${inst.name} cannot be deleted: ${plural(chg.count, "student charge is", "student charges are")} billed against it. Rename it or change its due date instead.`,
      };
    }
    if (hint.count) {
      return { error: `${inst.name} cannot be deleted: ${plural(hint.count, "imported payment refers", "imported payments refer")} to it.` };
    }
    const { error } = await supabase.from("installments").delete().eq("id", id);
    if (error) return { error: friendlyError(error) };
    refresh();
    return { ok: true, message: `${inst.name} deleted.` };
  }

  const name = str(fd, "name");
  const due = str(fd, "due_date");
  if (!name) return { error: "Enter a name." };
  if (!isIsoDate(due)) return { error: "Enter a valid due date." };
  const { error } = await supabase.from("installments").update({ name, due_date: due }).eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addInstallment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const sessionId = str(fd, "session_id");
  const number = Number(str(fd, "number"));
  const name = str(fd, "name") || `Installment ${number}`;
  const due = str(fd, "due_date");
  if (!Number.isInteger(number) || number < 1) return { error: "The installment number must be 1 or more." };
  if (!isIsoDate(due)) return { error: "Enter a valid due date." };
  const supabase = await createClient();
  const { error } = await supabase.from("installments").insert({ session_id: sessionId, number, name, due_date: due });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: `${name} added. Fill in its amounts on the fee structure page.` };
}
