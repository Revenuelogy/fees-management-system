"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseRupees } from "@/lib/format";
import { friendlyError, type ActionState } from "@/lib/action-state";

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const student_id = String(formData.get("student_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const promised_date = String(formData.get("promised_date") ?? "") || null;
  const amountRaw = String(formData.get("promised_amount") ?? "");
  const promised_amount = amountRaw ? parseRupees(amountRaw) : null;
  if (!note) return { error: "Write a note." };
  if (amountRaw && (promised_amount === null || promised_amount <= 0)) return { error: "Promised amount is not a valid rupee amount." };
  const supabase = await createClient();
  const { error } = await supabase.from("student_notes").insert({ student_id, note, promised_date, promised_amount });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/students/${student_id}`);
  return { ok: true, message: "Note saved." };
}

export async function deleteNote(id: string, studentId: string): Promise<ActionState> {
  await requireWriter();
  const supabase = await createClient();
  const { error } = await supabase.from("student_notes").delete().eq("id", id);
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/students/${studentId}`);
  return { ok: true };
}
