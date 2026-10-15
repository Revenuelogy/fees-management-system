"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { listJoin, plural } from "../_lib/text";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  // class and fee-head names appear on almost every page
  revalidatePath("/", "layout");
}

function intOrNull(v: string): number | null {
  if (v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Classes
// ---------------------------------------------------------------------------

export async function saveClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "class_id");
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { data: cls } = await supabase.from("classes").select("id, name").eq("id", id).maybeSingle();
    if (!cls) return { error: "That class no longer exists." };
    const { count } = await supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("class_id", id);
    if (count) {
      return {
        error: `${cls.name} cannot be deleted: ${plural(count, "student enrolment uses", "student enrolments use")} it (all sessions). Untick “Active” to hide it instead.`,
      };
    }
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return { error: friendlyError(error) };
    refresh();
    return { ok: true, message: `${cls.name} deleted.` };
  }

  const name = str(fd, "name");
  const sort = intOrNull(str(fd, "sort_order"));
  if (!name) return { error: "Enter a class name." };
  if (sort === null) return { error: "Sort order must be a whole number." };
  const { error } = await supabase
    .from("classes")
    .update({ name, sort_order: sort, is_active: fd.get("is_active") === "on" })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addClass(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const name = str(fd, "name");
  const sort = intOrNull(str(fd, "sort_order"));
  if (!name) return { error: "Enter a class name." };
  if (sort === null) return { error: "Sort order must be a whole number." };
  const supabase = await createClient();
  const { error } = await supabase.from("classes").insert({ name, sort_order: sort, is_active: fd.get("is_active") === "on" });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: `${name} added. Set its amounts on the fee structure page.` };
}

// ---------------------------------------------------------------------------
// Fee heads
// ---------------------------------------------------------------------------

export async function saveFeeHead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const id = str(fd, "fee_head_id");
  const supabase = await createClient();

  if (str(fd, "intent") === "delete") {
    const { data: head } = await supabase.from("fee_heads").select("id, name").eq("id", id).maybeSingle();
    if (!head) return { error: "That fee head no longer exists." };
    const [chg, fs, pay, alloc] = await Promise.all([
      supabase.from("student_charges").select("id", { count: "exact", head: true }).eq("fee_head_id", id),
      supabase.from("fee_structures").select("id", { count: "exact", head: true }).eq("fee_head_id", id),
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("fee_head_hint_id", id),
      supabase.from("allocations").select("id", { count: "exact", head: true }).eq("fee_head_id", id),
    ]);
    const uses: string[] = [];
    if (chg.count) uses.push(plural(chg.count, "student charge"));
    if (fs.count) uses.push(plural(fs.count, "fee-structure amount"));
    if (pay.count) uses.push(plural(pay.count, "imported payment"));
    if (alloc.count && !chg.count) uses.push(plural(alloc.count, "payment allocation"));
    if (uses.length) {
      return { error: `${head.name} cannot be deleted: it is used by ${listJoin(uses)}. Untick “Active” to hide it instead.` };
    }
    const { error } = await supabase.from("fee_heads").delete().eq("id", id);
    if (error) return { error: friendlyError(error) };
    refresh();
    return { ok: true, message: `${head.name} deleted.` };
  }

  const name = str(fd, "name");
  const priority = intOrNull(str(fd, "priority"));
  if (!name) return { error: "Enter a fee head name." };
  if (priority === null || priority < 0) return { error: "Priority must be a whole number (0 or more)." };

  const { data: before } = await supabase.from("fee_heads").select("priority").eq("id", id).maybeSingle();
  const { error } = await supabase
    .from("fee_heads")
    .update({ name, priority, is_active: fd.get("is_active") === "on" })
    .eq("id", id);
  if (error) return { error: friendlyError(error) };
  refresh();
  const reran = before && before.priority !== priority;
  return { ok: true, message: reran ? "Saved. Payment allocation was re-run for every student." : "Saved." };
}

export async function addFeeHead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireWriter();
  const name = str(fd, "name");
  const priority = intOrNull(str(fd, "priority"));
  if (!name) return { error: "Enter a fee head name." };
  if (priority === null || priority < 0) return { error: "Priority must be a whole number (0 or more)." };
  const supabase = await createClient();
  const { error } = await supabase.from("fee_heads").insert({ name, priority, is_active: fd.get("is_active") === "on" });
  if (error) return { error: friendlyError(error) };
  refresh();
  return { ok: true, message: `${name} added.` };
}
