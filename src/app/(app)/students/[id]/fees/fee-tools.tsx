"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Percent, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { withParams } from "@/components/ui/segmented";
import { addOpeningDue, applyConcession, regenerateCharges } from "./actions";
import { useFormAction } from "../../use-form-action";

const checkbox = "mt-0.5 size-4 accent-[var(--accent)]";

export function ConcessionTool({
  studentId,
  sessionId,
  sessionName,
  installments,
  feeHeads,
}: {
  studentId: string;
  sessionId: string;
  sessionName: string;
  installments: { number: number; name: string }[];
  feeHeads: { id: string; name: string }[];
}) {
  const [state, onSubmit, pending] = useFormAction(applyConcession);
  const [mode, setMode] = useState<"percent" | "amount" | "clear">("percent");

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Percent className="size-4 text-muted" aria-hidden /> Concession
        </span>
      }
      description={`Set the concession on many ${sessionName} lines at once. It replaces the current concession on the matching lines.`}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="student_id" value={studentId} />
        <input type="hidden" name="session_id" value={sessionId} />
        <Field label="Fee type" htmlFor="conc-head">
          <Select id="conc-head" name="fee_head_id" defaultValue="">
            <option value="">All fee types</option>
            {feeHeads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="conc-mode">
            <Select id="conc-mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="percent">Percent</option>
              <option value="amount">₹ per line</option>
              <option value="clear">Clear</option>
            </Select>
          </Field>
          <Field label={mode === "amount" ? "Amount (₹)" : "Percent (%)"} htmlFor="conc-value">
            <Input
              id="conc-value"
              name="value"
              inputMode="decimal"
              disabled={mode === "clear"}
              required={mode !== "clear"}
              placeholder={mode === "amount" ? "e.g. 500" : "e.g. 25"}
              key={mode}
            />
          </Field>
        </div>
        <Field
          label="From installment"
          htmlFor="conc-from"
          hint={
            mode === "amount"
              ? "This installment and every later one. The ₹ amount is set on each matching line, capped at the line amount."
              : "This installment and every later one."
          }
        >
          <Select id="conc-from" name="from_installment" defaultValue={String(installments[0]?.number ?? 1)}>
            {installments.map((i) => (
              <option key={i.number} value={i.number}>
                {i.number}. {i.name}
              </option>
            ))}
          </Select>
        </Field>
        <FormError message={state.error} />
        <FormSuccess message={state.message} />
        <Button type="submit" variant="secondary" disabled={pending || installments.length === 0}>
          {pending ? "Applying…" : mode === "clear" ? "Clear concession" : "Apply concession"}
        </Button>
      </form>
    </Card>
  );
}

export function RegenerateTool({
  studentId,
  sessionId,
  sessionName,
  className,
  isActive,
}: {
  studentId: string;
  sessionId: string;
  sessionName: string;
  className: string | null;
  isActive: boolean;
}) {
  const [state, onSubmit, pending] = useFormAction(regenerateCharges);
  const blocked = !className
    ? `The student is not enrolled in a class in ${sessionName}, so there is no class fee structure to use.`
    : !isActive
      ? "Only active students get charges from the class fee structure. Re-activate the student first."
      : null;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <RefreshCw className="size-4 text-muted" aria-hidden /> Re-generate from class structure
        </span>
      }
      description={
        className
          ? `Adds any missing lines from the ${className} fee structure for ${sessionName}.`
          : `Uses the fee structure of the student's class in ${sessionName}.`
      }
    >
      {blocked ? (
        <p className="text-footnote text-ink-2">{blocked}</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="session_id" value={sessionId} />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" name="overwrite" className={checkbox} />
            <span>
              Also reset existing lines to the structure
              <span className="block text-caption text-muted">
                Structure lines get the class amount again and lines no longer in the structure are removed. Lines edited or added by hand
                (Manual) and previous years&apos; dues are never touched. Concessions are kept (capped at the new amount).
              </span>
            </span>
          </label>
          <FormError message={state.error} />
          <FormSuccess message={state.message} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Working…" : "Re-generate"}
          </Button>
        </form>
      )}
    </Card>
  );
}

export function OpeningDueTool({
  studentId,
  sessions,
  defaultSessionId,
  currentSessionId,
  activeSessionId,
  baseHref,
}: {
  studentId: string;
  sessions: { id: string; name: string }[];
  defaultSessionId: string;
  currentSessionId: string;
  activeSessionId: string;
  baseHref: string;
}) {
  const [state, onSubmit, pending] = useFormAction(addOpeningDue);
  const addedTo = (state.data as { sessionId?: string } | undefined)?.sessionId;

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <History className="size-4 text-muted" aria-hidden /> Add previous years&apos; dues
        </span>
      }
      description="Fees of previous years still unpaid from before this app. It is added to the first installment of the chosen session with a top-priority fee type, so payments clear it first."
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="hidden" name="student_id" value={studentId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year it is from" htmlFor="open-session">
            <Select id="open-session" name="session_id" defaultValue={defaultSessionId}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)" htmlFor="open-amount">
            <Input id="open-amount" name="amount" inputMode="decimal" required placeholder="e.g. 4500" />
          </Field>
        </div>
        <Field label="Fee type" htmlFor="open-head" hint="Created if it does not exist. Adding again to the same head adds to it.">
          <Input id="open-head" name="fee_head" defaultValue="Previous Dues" />
        </Field>
        <Field label="Note" htmlFor="open-note">
          <Input id="open-note" name="note" placeholder="e.g. Balance from old register" />
        </Field>
        <FormError message={state.error} />
        <FormSuccess message={state.message} />
        {state.ok && addedTo && addedTo !== currentSessionId && (
          <p className="text-footnote">
            <Link
              href={addedTo === activeSessionId ? baseHref : withParams(baseHref, { session: addedTo })}
              className="font-medium text-accent hover:underline"
            >
              View that session&apos;s fee lines →
            </Link>
          </p>
        )}
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add previous years' dues"}
        </Button>
      </form>
    </Card>
  );
}
