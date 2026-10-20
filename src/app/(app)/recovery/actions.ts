// Form handlers for recovery campaigns and activities (API: /api/recovery). They call the API and refresh the screen.

import { api, errorMessage, refreshAll, submit } from "@/lib/api/client";
import { parseRupees } from "@/lib/format";
import { PARTICIPANT_RESPONSES, type ParticipantResponse } from "@/lib/recovery";
import type { ActionState } from "@/lib/action-state";
import { isIsoDate, isUuid, text } from "../students/helpers";

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function wholeNumber(formData: FormData, key: string): number | null {
  const v = text(formData, key);
  if (v === null) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

/** Create (no id) or update (id) a call campaign or activity. Rules apply to call campaigns. */
export async function saveCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  const kind = text(formData, "kind");
  const name = text(formData, "name");
  const start = text(formData, "start_date");
  const end = text(formData, "end_date");
  const targetRaw = text(formData, "target_amount");
  const target = targetRaw ? parseRupees(targetRaw) : null;
  if (kind !== "calls" && kind !== "activity") return { error: "Choose calls or an activity." };
  if (!name) return { error: "Give it a name." };
  if (!isIsoDate(start)) return { error: "Enter the start date." };
  if (end && !isIsoDate(end)) return { error: "The end date is not a valid date." };
  if (end && start && end < start) return { error: "The end date cannot be before the start date." };
  if (targetRaw && (target === null || target <= 0)) return { error: "The target is not a valid rupee amount." };

  const body: Record<string, unknown> = {
    name,
    description: text(formData, "description"),
    start_date: start,
    end_date: end,
    status: text(formData, "status") === "closed" ? "closed" : "active",
    target_amount: target,
  };
  if (kind === "calls") {
    const minDue = parseRupees(text(formData, "min_due") ?? "1");
    const silent = formData.get("use_silent") === "on" ? wholeNumber(formData, "silent_days") : null;
    const highRaw = text(formData, "high_due");
    const high = formData.get("use_high") === "on" ? parseRupees(highRaw) : null;
    const recall = wholeNumber(formData, "recall_days") ?? 7;
    if (minDue === null || minDue <= 0) return { error: "Enter the smallest overdue amount worth a call (₹1 or more)." };
    if (silent !== null && (Number.isNaN(silent) || silent < 1 || silent > 730)) return { error: "Days without payment must be between 1 and 730." };
    if (formData.get("use_high") === "on" && (high === null || high <= 0)) return { error: "Enter the amount that counts as big dues." };
    if (Number.isNaN(recall) || recall < 1 || recall > 90) return { error: "Days between calls must be between 1 and 90." };
    Object.assign(body, {
      class_ids: formData.getAll("class_ids").filter((v): v is string => typeof v === "string" && isUuid(v)),
      min_due: minDue,
      silent_days: silent,
      high_due: high,
      include_old_dues: formData.get("include_old_dues") === "on",
      include_broken: formData.get("include_broken") === "on",
      recall_days: recall,
    });
  }

  if (!id) {
    return submit(() => api.post<{ id: string }>("/api/recovery/campaigns", { kind, ...body }), (r) => ({ ok: true, redirect: `/recovery/${r.id}` }));
  }
  if (!isUuid(id)) return { error: "Unknown campaign." };
  return submit(() => api.put<Result>(`/api/recovery/campaigns/${id}`, body), (r) => ({ ok: true, message: r.message, redirect: `/recovery/${id}` }));
}

export async function deleteCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Unknown campaign." };
  try {
    await api.delete(`/api/recovery/campaigns/${id}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await refreshAll(id);
  return { ok: true, redirect: "/recovery" };
}

/** Add a class (section) to an activity, optionally only the students who owe. */
export async function addClassToActivity(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "campaign_id");
  const classId = text(formData, "class_id");
  if (!isUuid(id)) return { error: "Unknown activity." };
  if (!isUuid(classId)) return { error: "Choose a class." };
  return submit(
    () =>
      api.post<Result>(`/api/recovery/campaigns/${id}/participants`, {
        class_id: classId,
        section: text(formData, "section"),
        only_with_dues: formData.get("only_with_dues") === "on",
      }),
    withMessage,
  );
}

export async function addStudentToActivity(campaignId: string, studentId: string): Promise<ActionState> {
  return submit(() => api.post<Result>(`/api/recovery/campaigns/${campaignId}/participants`, { student_ids: [studentId] }), withMessage);
}

/** The accountant's view of a participant: did fees come in because of the activity? */
export async function saveResponse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "participant_id");
  const response = text(formData, "response") as ParticipantResponse | null;
  if (!isUuid(id)) return { error: "Unknown participant." };
  if (!response || !PARTICIPANT_RESPONSES.includes(response)) return { error: "Choose a response." };
  return submit(() => api.patch<Result>(`/api/recovery/participants/${id}`, { response, note: text(formData, "note") }), withMessage);
}

export async function removeParticipant(id: string): Promise<ActionState> {
  return submit(() => api.delete(`/api/recovery/participants/${id}`));
}

export async function creditReceipt(participantId: string, paymentId: string): Promise<ActionState> {
  return submit(() => api.post<Result>(`/api/recovery/participants/${participantId}/credits`, { payment_id: paymentId }), withMessage);
}

export async function uncreditReceipt(paymentId: string): Promise<ActionState> {
  return submit(() => api.delete<Result>(`/api/recovery/credits/${paymentId}`), withMessage);
}
