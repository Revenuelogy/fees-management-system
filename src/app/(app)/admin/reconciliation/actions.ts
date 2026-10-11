"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { monthLabel } from "@/lib/format";

function readMonth(formData: FormData): string | null {
  const v = formData.get("month");
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export async function rerunAllocation(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  void _formData;
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rerun_allocation");
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  const n = Number(data ?? 0);
  return { ok: true, message: `Allocation re-run for ${n} ${n === 1 ? "student" : "students"} with payments.` };
}

export async function closeMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const month = readMonth(formData);
  if (!month) return { error: "Unknown month." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_month", { p_month: `${month}-01` });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: `${monthLabel(month)} closed. Its numbers are frozen.` };
}

export async function reopenMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const month = readMonth(formData);
  if (!month) return { error: "Unknown month." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reopen_month", { p_month: `${month}-01` });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: `${monthLabel(month)} reopened. It shows live numbers again.` };
}
