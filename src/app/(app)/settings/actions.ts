// Form handlers for school settings (API: /api/settings). Admin only.

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function text(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function updateSchoolProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
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

  return submit(
    () =>
      api.put<Result>("/api/settings", {
        school_name: schoolName,
        address: text(formData, "address"),
        phone: text(formData, "phone"),
        email,
        affiliation: text(formData, "affiliation"),
        receipt_prefix: receiptPrefix,
        receipt_footer: text(formData, "receipt_footer"),
        session_start_month: month,
      }),
    withMessage,
  );
}

export async function updateAllocationRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const rule = text(formData, "allocation_order");
  if (rule !== "oldest_first" && rule !== "current_first") return { error: "Choose an allocation rule." };
  return submit(() => api.put<Result>("/api/settings/allocation-rule", { allocation_order: rule }), withMessage);
}

export async function updatePromiseGrace(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const days = Number(text(formData, "promise_grace_days"));
  if (!Number.isInteger(days) || days < 0 || days > 30) return { error: "Enter 0 to 30 days." };
  return submit(() => api.put<Result>("/api/settings/promise-grace", { promise_grace_days: days }), withMessage);
}
