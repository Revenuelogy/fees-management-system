"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";

export async function cancelReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason for cancelling (e.g. cheque bounced, wrong student)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_payment", { p_payment: paymentId, p_reason: reason });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Receipt cancelled. The dues it cleared are open again." };
}
