// Handlers for the admin tools on the health-check page (API: /api/admin, /api/months). Admin only.

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function readMonth(formData: FormData): string | null {
  const v = formData.get("month");
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export async function rerunAllocation(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  void _formData;
  return submit(() => api.post<Result>("/api/admin/reallocate"), withMessage);
}

export async function closeMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const month = readMonth(formData);
  if (!month) return { error: "Unknown month." };
  return submit(() => api.post<Result>(`/api/months/${month}/close`), withMessage);
}

export async function reopenMonth(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const month = readMonth(formData);
  if (!month) return { error: "Unknown month." };
  return submit(() => api.post<Result>(`/api/months/${month}/reopen`), withMessage);
}
