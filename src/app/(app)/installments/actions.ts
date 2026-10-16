// Form handlers for collection targets. They call the API (src/app/api/targets) and refresh the screen.

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

export async function createTarget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session_id = String(formData.get("session_id") ?? "");
  const target_pct = Number(formData.get("target_pct"));
  const target_date = String(formData.get("target_date") ?? "");
  const name = String(formData.get("name") ?? "").trim() || null;
  if (!session_id || !target_date || !(target_pct > 0 && target_pct <= 100)) {
    return { error: "Enter a target between 1 and 100% and a date." };
  }
  return submit(() => api.post("/api/targets", { session_id, name, target_pct, target_date }), () => ({ ok: true, message: "Target added." }));
}

export async function deleteTarget(id: string): Promise<ActionState> {
  return submit(() => api.delete(`/api/targets/${id}`));
}
