"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";

export async function createTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const session_id = String(formData.get("session_id") ?? "");
  const target_pct = Number(formData.get("target_pct"));
  const target_date = String(formData.get("target_date") ?? "");
  const name = String(formData.get("name") ?? "").trim() || `${target_pct}% of fees due by ${target_date}`;
  if (!session_id || !target_date || !(target_pct > 0 && target_pct <= 100)) {
    return { error: "Enter a target between 1 and 100% and a date." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("collection_targets").insert({ session_id, name, target_pct, target_date });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/installments");
  return { ok: true, message: "Target added." };
}

export async function deleteTarget(id: string): Promise<ActionState> {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase.from("collection_targets").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/installments");
  return { ok: true };
}
