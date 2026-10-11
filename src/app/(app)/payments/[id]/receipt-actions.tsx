"use client";

import { useActionState, useState } from "react";
import { Ban } from "lucide-react";
import { cancelReceipt } from "./actions";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess, Input } from "@/components/ui/form";

export function CancelReceipt({ paymentId, receiptNo }: { paymentId: string; receiptNo: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(cancelReceipt, {});
  if (state.ok) return <FormSuccess message={state.message} />;
  if (!open)
    return (
      <Button type="button" variant="ghost" onClick={() => setOpen(true)} className="text-critical-ink">
        <Ban className="size-4" /> Cancel receipt
      </Button>
    );
  return (
    <form action={action} className="w-full space-y-2 rounded-lg border border-critical/30 bg-critical-soft p-3">
      <input type="hidden" name="payment_id" value={paymentId} />
      <p className="text-[13px] text-ink">
        Cancelling <b>{receiptNo}</b> adds a reversing entry dated today. The original stays on record and the dues it cleared become unpaid again.
      </p>
      <Input name="reason" placeholder="Reason (cheque bounced, wrong student, duplicate entry…)" required autoFocus />
      <FormError message={state.error} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </Button>
        <Button type="button" size="sm" onClick={() => setOpen(false)}>
          Keep receipt
        </Button>
      </div>
    </form>
  );
}
