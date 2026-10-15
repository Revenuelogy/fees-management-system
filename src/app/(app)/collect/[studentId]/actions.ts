"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseRupees } from "@/lib/format";
import { friendlyError, type ActionState } from "@/lib/action-state";
import type { PaymentMode } from "@/lib/types";

const MODES: PaymentMode[] = ["cash", "upi", "cheque", "bank_transfer", "card", "other"];

export async function collectPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const studentId = String(formData.get("student_id") ?? "");
  const amount = parseRupees(String(formData.get("amount") ?? ""));
  const paidOn = String(formData.get("paid_on") ?? "");
  const mode = String(formData.get("mode") ?? "cash") as PaymentMode;
  const reference = String(formData.get("reference_no") ?? "").trim();
  const remarks = String(formData.get("remarks") ?? "").trim();
  let targets: { charge_id: string; amount: number }[] = [];
  try {
    targets = JSON.parse(String(formData.get("targets") ?? "[]"));
  } catch {
    return { error: "Could not read the allocation. Please try again." };
  }

  if (!amount || amount <= 0) return { error: "Enter the amount received." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Enter the payment date." };
  if (!MODES.includes(mode)) return { error: "Choose a payment mode." };
  if ((mode === "cheque" || mode === "upi" || mode === "bank_transfer") && !reference) {
    return { error: mode === "cheque" ? "Enter the cheque number." : "Enter the transaction / UTR reference." };
  }
  targets = targets.filter((t) => t && typeof t.charge_id === "string" && Number.isInteger(t.amount) && t.amount > 0);
  const allocated = targets.reduce((a, t) => a + t.amount, 0);
  if (allocated > amount) return { error: "The amounts allocated to dues add up to more than the amount received." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("collect_payment", {
    p_student: studentId,
    p_amount: amount,
    p_paid_on: paidOn,
    p_mode: mode,
    p_reference: reference || null,
    p_remarks: remarks || null,
    p_targets: targets,
  });
  if (error) return { error: friendlyError(error) };
  const result = data as { payment_id: string; receipt_no: string };
  revalidatePath("/", "layout");
  redirect(`/payments/${result.payment_id}?new=1`);
}
