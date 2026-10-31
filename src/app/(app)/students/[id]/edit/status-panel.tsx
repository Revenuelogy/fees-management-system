"use client";

import { useState } from "react";
import { Trash2, UserCheck, UserX } from "lucide-react";
import { fmtDate } from "@/lib/format";
import type { Student } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { deleteStudent, reactivateStudent, withdrawStudent } from "../../actions";
import { useFormAction } from "../../use-form-action";
import { STUDENT_STATUS_LABELS } from "../../helpers";

export function StatusPanel({
  studentId,
  admissionNo,
  status,
  leftOn,
  paymentCount,
  waivedLines,
  today,
}: {
  studentId: string;
  admissionNo: string;
  status: Student["status"];
  leftOn: string | null;
  paymentCount: number;
  waivedLines: number;
  today: string;
}) {
  // The card that ran the action is swapped for the other one when the status changes,
  // so the success message is kept here.
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <FormSuccess message={notice} />
      {status === "active" ? (
        <WithdrawCard studentId={studentId} today={today} onDone={setNotice} />
      ) : (
        <ReactivateCard studentId={studentId} status={status} leftOn={leftOn} waivedLines={waivedLines} onDone={setNotice} />
      )}
      <DeleteCard studentId={studentId} admissionNo={admissionNo} paymentCount={paymentCount} />
    </div>
  );
}

type Done = (message: string | null) => void;

function withNotice(action: typeof withdrawStudent, onDone: Done): typeof withdrawStudent {
  return async (prev, formData) => {
    onDone(null);
    const result = await action(prev, formData);
    if (result.ok) onDone(result.message ?? "Saved.");
    return result;
  };
}

function WithdrawCard({ studentId, today, onDone }: { studentId: string; today: string; onDone: Done }) {
  const [state, onSubmit, pending] = useFormAction(withNotice(withdrawStudent, onDone));
  return (
    <Card title="Mark as left" description="For a student who has left the school. Payments and unpaid fees stay on record.">
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={studentId} />
        <Field label="Left on" htmlFor="left_on">
          <Input id="left_on" name="left_on" type="date" defaultValue={today} required />
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <input type="checkbox" name="waive" defaultChecked className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Waive installments due after this date
            <span className="block text-caption text-muted">
              Their full amount becomes a concession, so they no longer count as pending. Dues already past stay payable.
            </span>
          </span>
        </label>
        <FormError message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          <UserX className="size-4" /> {pending ? "Saving…" : "Mark as left"}
        </Button>
      </form>
    </Card>
  );
}

function ReactivateCard({
  studentId,
  status,
  leftOn,
  waivedLines,
  onDone,
}: {
  studentId: string;
  status: Student["status"];
  leftOn: string | null;
  waivedLines: number;
  onDone: Done;
}) {
  const [state, onSubmit, pending] = useFormAction(withNotice(reactivateStudent, onDone));
  return (
    <Card
      title="Re-activate"
      description={
        <>
          Status: <b>{STUDENT_STATUS_LABELS[status]}</b>
          {status === "left" && leftOn ? ` on ${fmtDate(leftOn)}` : ""}. Re-activate a student who has come back or was marked by mistake.
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="id" value={studentId} />
        {waivedLines > 0 && (
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="restore" defaultChecked className="mt-0.5 size-4 accent-[var(--accent)]" />
            <span>
              Restore the {waivedLines} fee {waivedLines === 1 ? "line" : "lines"} waived when the student left
              <span className="block text-caption text-muted">
                Any concession they had before leaving (for example a sibling discount) comes back too.
              </span>
            </span>
          </label>
        )}
        <FormError message={state.error} />
        <Button type="submit" variant="secondary" disabled={pending}>
          <UserCheck className="size-4" /> {pending ? "Saving…" : "Re-activate"}
        </Button>
      </form>
    </Card>
  );
}

function DeleteCard({ studentId, admissionNo, paymentCount }: { studentId: string; admissionNo: string; paymentCount: number }) {
  const [state, onSubmit, pending] = useFormAction(deleteStudent);
  const [confirming, setConfirming] = useState(false);

  if (paymentCount > 0) {
    return (
      <Card title="Delete student">
        <p className="text-footnote text-ink-2">
          This student has {paymentCount} payment {paymentCount === 1 ? "receipt" : "receipts"}. Receipts are permanent, so the student
          cannot be deleted. Mark them as left instead.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Delete student" description="Only for a record added by mistake. Removes the student, their enrolments, fee plan and notes.">
      {!confirming ? (
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" /> Delete student…
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="hidden" name="id" value={studentId} />
          <Field label={`Type ${admissionNo} to confirm`} htmlFor="confirm">
            <Input id="confirm" name="confirm" autoComplete="off" autoFocus required />
          </Field>
          <FormError message={state.error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" disabled={pending}>
              <Trash2 className="size-4" /> {pending ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
