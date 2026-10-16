// Form handlers for student notes and payment promises (API: /api/students/[id]/notes).

import { api, submit } from "@/lib/api/client";
import { parseRupees } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";

export async function addNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const student_id = String(formData.get("student_id") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const promised_date = String(formData.get("promised_date") ?? "") || null;
  const amountRaw = String(formData.get("promised_amount") ?? "");
  const promised_amount = amountRaw ? parseRupees(amountRaw) : null;
  if (!note) return { error: "Write a note." };
  if (amountRaw && (promised_amount === null || promised_amount <= 0)) return { error: "Promised amount is not a valid rupee amount." };
  return submit(() => api.post(`/api/students/${student_id}/notes`, { note, promised_date, promised_amount }), () => ({
    ok: true,
    message: "Note saved.",
  }));
}

export async function deleteNote(id: string, studentId: string): Promise<ActionState> {
  return submit(() => api.delete(`/api/students/${studentId}/notes/${id}`));
}
