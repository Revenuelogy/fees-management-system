"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDate, parseRupees, rupees } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { addCharge, deleteCharge, updateCharge } from "./actions";
import { useFormAction } from "../../use-form-action";
import { toRupeeInput } from "../../helpers";

export type PlanLine = {
  charge_id: string;
  fee_head: string;
  amount: number;
  concession: number;
  net: number;
  paid: number;
  remaining: number;
  is_overdue: boolean;
  source: string;
  note: string | null;
};

export type PlanGroup = {
  installment_id: string;
  number: number;
  name: string;
  due_date: string;
  lines: PlanLine[];
};

type Totals = { amount: number; concession: number; net: number; paid: number; remaining: number };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;
type Notify = (message: string | null) => void;

const SOURCE_LABEL: Record<string, string> = { manual: "Manual", opening: "Opening due", import: "Imported" };

/** Run an action and report a successful result to the parent (the row may unmount afterwards). */
function reporting(action: Action, notify: Notify, after?: () => void): Action {
  return async (prev, formData) => {
    notify(null);
    const result = await action(prev, formData);
    if (result.ok) {
      notify(result.message ?? "Saved.");
      after?.();
    }
    return result;
  };
}

function sumLines(lines: PlanLine[]): Totals {
  return lines.reduce(
    (t, l) => ({
      amount: t.amount + l.amount,
      concession: t.concession + l.concession,
      net: t.net + l.net,
      paid: t.paid + l.paid,
      remaining: t.remaining + l.remaining,
    }),
    { amount: 0, concession: 0, net: 0, paid: 0, remaining: 0 },
  );
}

function InstallmentStatus({ lines, dueDate }: { lines: PlanLine[]; dueDate: string }) {
  if (lines.length === 0) return null;
  const t = sumLines(lines);
  const overdue = lines.some((l) => l.is_overdue);
  if (t.net === 0)
    return (
      <Badge tone="neutral">
        <CircleSlash className="size-3.5" aria-hidden /> Waived
      </Badge>
    );
  if (t.remaining <= 0)
    return (
      <Badge tone="good">
        <CheckCircle2 className="size-3.5" aria-hidden /> Paid
      </Badge>
    );
  if (overdue)
    return (
      <Badge tone="critical" title={`Due ${fmtDate(dueDate)}`}>
        <AlertTriangle className="size-3.5" aria-hidden /> {t.paid > 0 ? "Partly paid · overdue" : "Overdue"}
      </Badge>
    );
  return (
    <Badge tone={t.paid > 0 ? "warning" : "neutral"}>
      <Clock className="size-3.5" aria-hidden /> {t.paid > 0 ? "Partly paid" : "Upcoming"}
    </Badge>
  );
}

export function FeePlan({
  studentId,
  groups,
  totals,
  installments,
  feeHeads,
}: {
  studentId: string;
  groups: PlanGroup[];
  totals: Totals;
  installments: { id: string; number: number; name: string }[];
  feeHeads: { id: string; name: string }[];
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const money = "px-3 py-2 text-right whitespace-nowrap tabular";

  return (
    <div className="space-y-4">
      <FormSuccess message={notice} />
      <div className="relative overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] border-collapse text-left text-[13.5px]">
          <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Fee head</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Concession</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Net</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Paid</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Remaining</th>
              <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          {groups.map((g) => {
            const t = sumLines(g.lines);
            return (
              <tbody key={g.installment_id} className="border-t-2 border-line">
                <tr className="bg-surface-2/50">
                  <th scope="rowgroup" colSpan={7} className="px-3 py-2 text-left font-normal">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">
                        {g.number}. {g.name}
                      </span>
                      <span className="text-[12.5px] text-muted">due {fmtDate(g.due_date)}</span>
                      <InstallmentStatus lines={g.lines} dueDate={g.due_date} />
                    </span>
                  </th>
                </tr>
                {g.lines.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={7} className="px-3 py-2 text-[13px] text-muted">
                      No fee lines in this installment.
                    </td>
                  </tr>
                )}
                {g.lines.map((l) => (
                  <ChargeRow key={`${l.charge_id}:${l.amount}:${l.concession}`} line={l} studentId={studentId} notify={setNotice} />
                ))}
                {g.lines.length > 1 && (
                  <tr className="border-t border-line text-[12.5px] text-ink-2">
                    <td className="px-3 py-1.5">Installment total</td>
                    <td className={cn(money, "py-1.5")}>{rupees(t.amount)}</td>
                    <td className={cn(money, "py-1.5")}>{rupees(t.concession)}</td>
                    <td className={cn(money, "py-1.5 font-medium text-ink")}>{rupees(t.net)}</td>
                    <td className={cn(money, "py-1.5")}>{rupees(t.paid)}</td>
                    <td className={cn(money, "py-1.5 font-medium text-ink")}>{rupees(t.remaining)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            );
          })}
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
              <td className="px-3 py-2">Session total</td>
              <td className={money}>{rupees(totals.amount)}</td>
              <td className={money}>{rupees(totals.concession)}</td>
              <td className={money}>{rupees(totals.net)}</td>
              <td className={money}>{rupees(totals.paid)}</td>
              <td className={cn(money, totals.remaining > 0 && "text-critical-ink")}>{rupees(totals.remaining)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <AddLineForm studentId={studentId} installments={installments} feeHeads={feeHeads} notify={setNotice} />
    </div>
  );
}

function ChargeRow({ line, studentId, notify }: { line: PlanLine; studentId: string; notify: Notify }) {
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [amount, setAmount] = useState(toRupeeInput(line.amount));
  const [concession, setConcession] = useState(toRupeeInput(line.concession));
  const [saveState, onSave, saving] = useFormAction(reporting(updateCharge, notify, () => setMode("view")));
  const [delState, onDelete, deleting] = useFormAction(reporting(deleteCharge, notify));
  const formId = `charge-${line.charge_id}`;
  const money = "px-3 py-2 text-right whitespace-nowrap tabular";

  const a = parseRupees(amount);
  const c = parseRupees(concession === "" ? "0" : concession);
  const previewNet = a !== null && c !== null ? a - c : null;
  const error = mode === "edit" ? saveState.error : mode === "delete" ? delState.error : undefined;

  return (
    <>
      <tr className={cn("border-t border-line align-top", mode !== "view" && "bg-accent-soft/40")}>
        <td className="px-3 py-2">
          <span className="font-medium text-ink">{line.fee_head}</span>
          {SOURCE_LABEL[line.source] && (
            <Badge tone="neutral" className="ml-1.5" title={line.source === "manual" ? "Edited or added by hand; kept when re-generating from the class structure" : undefined}>
              {SOURCE_LABEL[line.source]}
            </Badge>
          )}
          {line.note && (
            <span className="block max-w-[280px] truncate text-[12px] text-muted" title={line.note}>
              {line.note}
            </span>
          )}
        </td>
        {mode === "edit" ? (
          <>
            <td className="px-3 py-1.5 text-right">
              <Input
                form={formId}
                name="amount"
                inputMode="decimal"
                aria-label="Amount (₹)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ml-auto w-28 text-right tabular"
                required
                autoFocus
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              <Input
                form={formId}
                name="concession"
                inputMode="decimal"
                aria-label="Concession (₹)"
                value={concession}
                onChange={(e) => setConcession(e.target.value)}
                className="ml-auto w-28 text-right tabular"
              />
            </td>
            <td className={cn(money, "text-ink-2")}>{previewNet === null ? "—" : rupees(previewNet)}</td>
          </>
        ) : (
          <>
            <td className={money}>{rupees(line.amount)}</td>
            <td className={cn(money, line.concession === 0 && "text-muted")}>{rupees(line.concession)}</td>
            <td className={cn(money, "font-medium text-ink")}>{rupees(line.net)}</td>
          </>
        )}
        <td className={cn(money, line.paid === 0 && "text-muted")}>{rupees(line.paid)}</td>
        <td className={cn(money, line.remaining > 0 && line.is_overdue && "font-medium text-critical-ink", line.remaining === 0 && "text-muted")}>
          {rupees(line.remaining)}
        </td>
        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          {mode === "view" && (
            <span className="inline-flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("edit")} aria-label={`Edit ${line.fee_head}`} title="Edit amount / concession">
                <Pencil className="size-4" />
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("delete")} aria-label={`Delete ${line.fee_head}`} title="Delete line">
                <Trash2 className="size-4" />
              </Button>
            </span>
          )}
          {mode === "edit" && (
            <form id={formId} onSubmit={onSave} className="inline-flex gap-1">
              <input type="hidden" name="student_id" value={studentId} />
              <input type="hidden" name="charge_id" value={line.charge_id} />
              <Button type="submit" size="sm" variant="primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAmount(toRupeeInput(line.amount));
                  setConcession(toRupeeInput(line.concession));
                  setMode("view");
                }}
              >
                Cancel
              </Button>
            </form>
          )}
          {mode === "delete" && (
            <form onSubmit={onDelete} className="inline-flex gap-1">
              <input type="hidden" name="student_id" value={studentId} />
              <input type="hidden" name="charge_id" value={line.charge_id} />
              <Button type="submit" size="sm" variant="danger" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode("view")}>
                Keep
              </Button>
            </form>
          )}
        </td>
      </tr>
      {mode === "delete" && (
        <tr className="bg-accent-soft/40">
          <td colSpan={7} className="px-3 pb-2 text-[12.5px] text-ink">
            Delete the {line.fee_head} line ({rupees(line.net)})?{" "}
            {line.paid > 0 ? (
              <b>
                {rupees(line.paid)} already paid against it will be re-matched to the student&apos;s other dues, or kept as advance if
                nothing else is due.
              </b>
            ) : (
              "Nothing has been paid against it."
            )}
          </td>
        </tr>
      )}
      {mode === "edit" && previewNet !== null && previewNet < line.paid && (
        <tr className="bg-accent-soft/40">
          <td colSpan={7} className="px-3 pb-2 text-[12.5px] text-ink">
            {rupees(line.paid)} is already paid against this line. Lowering it to {rupees(previewNet)} moves{" "}
            {rupees(line.paid - previewNet)} to other dues (or advance).
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={7} className="px-3 pb-2">
            <FormError message={error} />
          </td>
        </tr>
      )}
    </>
  );
}

function AddLineForm({
  studentId,
  installments,
  feeHeads,
  notify,
}: {
  studentId: string;
  installments: { id: string; number: number; name: string }[];
  feeHeads: { id: string; name: string }[];
  notify: Notify;
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = useFormAction(reporting(addCharge, notify, () => setOpen(false)));

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add a fee line
      </Button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="rounded-lg border border-line bg-surface-2/40 p-3 sm:p-4">
      <input type="hidden" name="student_id" value={studentId} />
      <p className="mb-3 text-[13px] font-medium text-ink">Add a fee line</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Installment" htmlFor="add-inst">
          <Select id="add-inst" name="installment_id" required defaultValue={installments[0]?.id}>
            {installments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.number}. {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fee head" htmlFor="add-head">
          <Select id="add-head" name="fee_head_id" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {feeHeads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount (₹)" htmlFor="add-amount">
          <Input id="add-amount" name="amount" inputMode="decimal" required placeholder="0" />
        </Field>
        <Field label="Concession (₹)" htmlFor="add-conc">
          <Input id="add-conc" name="concession" inputMode="decimal" placeholder="0" />
        </Field>
        <Field label="Note" htmlFor="add-note">
          <Input id="add-note" name="note" placeholder="Optional" />
        </Field>
      </div>
      <div className="mt-3 space-y-3">
        <FormError message={state.error} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add line"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
