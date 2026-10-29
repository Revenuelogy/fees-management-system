// Form handlers for a student's fee plan. They parse what was typed (rupees -> paise) and call the API
// (src/app/api/students/[id]/...); the API applies the change and words the result.

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import { parseRupees } from "@/lib/format";
import { isUuid, text } from "../../helpers";

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function ids(formData: FormData) {
  const studentId = text(formData, "student_id");
  const chargeId = text(formData, "charge_id");
  return { studentId: isUuid(studentId) ? studentId : null, chargeId: isUuid(chargeId) ? chargeId : null };
}

export async function updateCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { studentId, chargeId } = ids(formData);
  if (!studentId || !chargeId) return { error: "Unknown fee line." };
  const amount = parseRupees(text(formData, "amount"));
  const concession = parseRupees(text(formData, "concession") ?? "0");
  if (amount === null || amount < 0) return { error: "Enter a valid amount (₹)." };
  if (concession === null || concession < 0) return { error: "Enter a valid concession (₹)." };
  if (concession > amount) return { error: "Concession cannot be more than the amount." };
  return submit(() => api.patch<Result>(`/api/students/${studentId}/charges/${chargeId}`, { amount, concession }), withMessage);
}

export async function deleteCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { studentId, chargeId } = ids(formData);
  if (!studentId || !chargeId) return { error: "Unknown fee line." };
  return submit(() => api.delete<Result>(`/api/students/${studentId}/charges/${chargeId}`), withMessage);
}

export async function addCharge(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = text(formData, "student_id");
  const installmentId = text(formData, "installment_id");
  const feeHeadId = text(formData, "fee_head_id");
  const amount = parseRupees(text(formData, "amount"));
  const concession = parseRupees(text(formData, "concession") ?? "0");
  if (!isUuid(studentId)) return { error: "Unknown student." };
  if (!isUuid(installmentId)) return { error: "Choose an installment." };
  if (!isUuid(feeHeadId)) return { error: "Choose a fee type." };
  if (amount === null || amount <= 0) return { error: "Enter an amount greater than zero (₹)." };
  if (concession === null || concession < 0) return { error: "Enter a valid concession (₹)." };
  if (concession > amount) return { error: "Concession cannot be more than the amount." };
  return submit(
    () =>
      api.post<Result>(`/api/students/${studentId}/charges`, {
        installment_id: installmentId,
        fee_head_id: feeHeadId,
        amount,
        concession,
        note: text(formData, "note"),
      }),
    withMessage,
  );
}

export async function applyConcession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  const feeHead = text(formData, "fee_head_id");
  const mode = text(formData, "mode");
  const from = Number(text(formData, "from_installment") ?? "1");
  if (!isUuid(studentId) || !isUuid(sessionId)) return { error: "Unknown student or session." };
  if (feeHead && !isUuid(feeHead)) return { error: "Choose a fee type." };
  if (mode !== "percent" && mode !== "amount" && mode !== "clear") return { error: "Choose how to apply the concession." };
  if (!Number.isInteger(from) || from < 1) return { error: "Choose the installment to start from." };

  let value = 0;
  if (mode === "percent") {
    const raw = text(formData, "value");
    const pct = raw === null ? NaN : Number(raw.replace("%", ""));
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { error: "Enter a percentage between 0 and 100." };
    value = pct;
  } else if (mode === "amount") {
    const paise = parseRupees(text(formData, "value"));
    if (paise === null || paise < 0) return { error: "Enter the concession amount per installment line (₹)." };
    value = paise;
  }
  return submit(
    () =>
      api.post<Result>(`/api/students/${studentId}/concessions`, {
        session_id: sessionId,
        fee_head_id: feeHead,
        mode,
        value,
        from_installment: from,
      }),
    withMessage,
  );
}

export async function regenerateCharges(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  if (!isUuid(studentId) || !isUuid(sessionId)) return { error: "Unknown student or session." };
  return submit(
    () => api.post<Result>(`/api/students/${studentId}/charges/generate`, { session_id: sessionId, overwrite: formData.get("overwrite") === "on" }),
    withMessage,
  );
}

export async function addOpeningDue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const studentId = text(formData, "student_id");
  const sessionId = text(formData, "session_id");
  const amount = parseRupees(text(formData, "amount"));
  if (!isUuid(studentId)) return { error: "Unknown student." };
  if (!isUuid(sessionId)) return { error: "Choose the year these dues are from." };
  if (amount === null || amount <= 0) return { error: "Enter an amount greater than zero (₹)." };
  return submit(
    () =>
      api.post<Result & { session_id: string }>(`/api/students/${studentId}/opening-dues`, {
        session_id: sessionId,
        amount,
        fee_head: text(formData, "fee_head") ?? "Previous Dues",
        note: text(formData, "note"),
      }),
    (r) => ({ ok: true, message: r.message, data: { sessionId: r.session_id } }),
  );
}
