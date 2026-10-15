"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";

function text(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function updateSchoolProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const schoolName = text(formData, "school_name");
  const receiptPrefix = text(formData, "receipt_prefix");
  const email = text(formData, "email");
  const month = Number(text(formData, "session_start_month"));
  if (!schoolName) return { error: "Enter the school name." };
  if (!receiptPrefix) return { error: "Enter a receipt prefix (for example R or SPS)." };
  if (!/^[A-Za-z0-9/_.-]{1,12}$/.test(receiptPrefix)) {
    return { error: "Receipt prefix: up to 12 letters or digits (/, -, _ and . are allowed), no spaces." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "The email address does not look right." };
  if (!Number.isInteger(month) || month < 1 || month > 12) return { error: "Choose the month a session starts." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("school_settings")
    .update({
      school_name: schoolName,
      address: text(formData, "address"),
      phone: text(formData, "phone"),
      email,
      affiliation: text(formData, "affiliation"),
      receipt_prefix: receiptPrefix,
      receipt_footer: text(formData, "receipt_footer"),
      session_start_month: month,
    })
    .eq("id", 1);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "School profile saved." };
}

export async function updateAllocationRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const rule = text(formData, "allocation_order");
  if (rule !== "oldest_first" && rule !== "current_first") return { error: "Choose an allocation rule." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("school_settings").select("allocation_order").eq("id", 1).maybeSingle();
  const before = (current as { allocation_order: string } | null)?.allocation_order;
  if (before === rule) return { ok: true, message: "The rule is unchanged." };

  // A trigger on school_settings re-runs the allocation of every payment when this changes.
  const { error } = await supabase.from("school_settings").update({ allocation_order: rule }).eq("id", 1);
  if (error) return { error: friendlyError(error) };
  await supabase.rpc("audit", {
    p_action: "change_allocation_rule",
    p_entity: "school_settings",
    p_entity_id: "1",
    p_details: { from: before ?? null, to: rule },
  });
  revalidatePath("/", "layout");
  return {
    ok: true,
    message:
      rule === "oldest_first"
        ? "Saved. Every payment has been re-matched: previous-session dues are now cleared first."
        : "Saved. Every payment has been re-matched: current-session fees are now cleared first.",
  };
}
