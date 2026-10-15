"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { plural } from "../_lib/text";

type PromoteResult = { promoted: number; passed_out: number; skipped: number };

export async function promoteStudents(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const from = String(fd.get("from") ?? "");
  const to = String(fd.get("to") ?? "");
  const generate = fd.get("generate") === "on";
  if (!from || !to) return { error: "Choose both sessions." };
  if (from === to) return { error: "Choose two different sessions." };

  let rows: { from_class: string; target: string }[];
  try {
    rows = JSON.parse(String(fd.get("mapping") ?? "[]"));
    if (!Array.isArray(rows)) throw new Error();
  } catch {
    return { error: "Could not read the class mapping." };
  }
  // "skip" rows are left out; "passed" means the students leave the school (to_class null)
  const mapping = rows
    .filter((r) => r.target && r.target !== "skip")
    .map((r) => ({ from_class: r.from_class, to_class: r.target === "passed" ? null : r.target }));
  if (mapping.length === 0) return { error: "Every class is set to “Do not promote”. Choose at least one target class." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_students", {
    p_from: from,
    p_to: to,
    p_mapping: mapping,
    p_generate: generate,
  });
  if (error) return { error: friendlyError(error) };
  const r = data as PromoteResult;

  revalidatePath("/", "layout");
  const parts = [`Promoted ${plural(r.promoted, "student")}`];
  if (r.passed_out) parts.push(`marked ${plural(r.passed_out, "student")} as passed out`);
  if (r.skipped) parts.push(`left ${plural(r.skipped, "student")} alone who were already enrolled in the target session`);
  return {
    ok: true,
    data: r,
    message: `${parts.join(", ")}.${generate && r.promoted ? " Charges were generated from the target session's fee structure." : ""}`,
  };
}
