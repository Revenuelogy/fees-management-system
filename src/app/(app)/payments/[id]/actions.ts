// Form handler for cancelling a receipt (API: POST /api/payments/[id]/cancel).

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";

export async function cancelReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const paymentId = String(formData.get("payment_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Give a reason for cancelling (e.g. cheque bounced, wrong student)." };
  return submit(
    () => api.post<{ message: string }>(`/api/payments/${paymentId}/cancel`, { reason }),
    (r) => ({ ok: true, message: r.message }),
  );
}
