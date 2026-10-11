"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";
import { useFormAction } from "../_lib/use-form-action";
import { plural, listJoin } from "../_lib/text";
import { addInstallment, deleteSession, makeCurrent, saveInstallment, updateSession } from "./actions";

export type SessionInfo = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  enrollments: number;
  payments: number;
  charges: number;
};

export type InstallmentInfo = {
  id: string;
  number: number;
  name: string;
  due_date: string;
  charges: number;
};

const ROW = "grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 sm:grid-cols-[2.25rem_minmax(0,1fr)_9.75rem_6rem_5.75rem]";

export function SessionPanel({
  session,
  installments,
  nextInstallment,
}: {
  session: SessionInfo;
  installments: InstallmentInfo[];
  nextInstallment: { number: number; name: string; due_date: string };
}) {
  const usage = [
    session.enrollments ? plural(session.enrollments, "enrolment") : null,
    session.payments ? plural(session.payments, "payment") : null,
  ].filter(Boolean) as string[];

  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          {session.name}
          {session.is_current && (
            <Badge tone="accent">
              <Star className="size-3" aria-hidden /> Current
            </Badge>
          )}
        </span>
      }
      description={
        <>
          {fmtDate(session.start_date)} – {fmtDate(session.end_date)}
          {usage.length > 0 && <> · {usage.join(" · ")}</>}
        </>
      }
      actions={!session.is_current ? <MakeCurrentButton id={session.id} name={session.name} /> : undefined}
    >
      <div className={`${ROW} hidden border-b border-line pb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted sm:grid`}>
        <span>No.</span>
        <span>Installment name</span>
        <span>Due date</span>
        <span>Billed</span>
        <span className="sr-only">Actions</span>
      </div>
      {installments.length === 0 && <p className="py-3 text-[13px] text-ink-2">No installments yet. Add the first one below.</p>}
      <div className="divide-y divide-line">
        {installments.map((i) => (
          <InstallmentRow key={i.id} inst={i} />
        ))}
      </div>
      <AddInstallmentRow sessionId={session.id} next={nextInstallment} />

      <details className="group mt-4 rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-medium text-ink-2 hover:text-ink">
          <Pencil className="size-3.5" aria-hidden /> Edit name and dates, or delete this session
        </summary>
        <div className="space-y-4 border-t border-line p-3">
          <EditSessionForm session={session} />
          <DeleteSessionForm session={session} />
        </div>
      </details>
    </Card>
  );
}

function MakeCurrentButton({ id, name }: { id: string; name: string }) {
  const { state, pending, onSubmit } = useFormAction(makeCurrent);
  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="session_id" value={id} />
      <Button
        type="submit"
        size="sm"
        disabled={pending}
        data-confirm={`Make ${name} the current session? It becomes the session everyone sees by default.`}
      >
        <Star className="size-3.5" aria-hidden /> {pending ? "Saving…" : "Make current"}
      </Button>
      <FormError message={state.error} />
    </form>
  );
}

function InstallmentRow({ inst }: { inst: InstallmentInfo }) {
  const { state, pending, onSubmit } = useFormAction(saveInstallment);
  return (
    <form onSubmit={onSubmit} className={`${ROW} py-2`}>
      <input type="hidden" name="installment_id" value={inst.id} />
      <span className="text-[13px] font-semibold tabular text-ink-2">#{inst.number}</span>
      <Input name="name" defaultValue={inst.name} aria-label={`Name of installment ${inst.number}`} required />
      <Input
        name="due_date"
        type="date"
        defaultValue={inst.due_date}
        aria-label={`Due date of installment ${inst.number}`}
        required
        className="col-start-2 sm:col-start-auto"
      />
      <span className="col-start-2 text-[12.5px] text-muted sm:col-start-auto" title="Student charge lines billed against this installment">
        {inst.charges ? plural(inst.charges, "charge") : "Not billed yet"}
      </span>
      <div className="col-start-2 flex gap-1.5 sm:col-start-auto">
        <Button type="submit" name="intent" value="save" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="delete"
          size="sm"
          variant="ghost"
          disabled={pending}
          title={inst.charges ? "Cannot delete: students are billed against this installment" : "Delete installment"}
          aria-label={`Delete installment ${inst.number}`}
          data-confirm={`Delete installment ${inst.number} (${inst.name})? Its amounts in the fee structure are removed too.`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>
      {(state.error || state.message) && (
        <div className="col-span-full">
          <FormError message={state.error} />
          {state.ok && <p className="text-[12.5px] text-good-ink">{state.message}</p>}
        </div>
      )}
    </form>
  );
}

function AddInstallmentRow({ sessionId, next }: { sessionId: string; next: { number: number; name: string; due_date: string } }) {
  const { state, pending, onSubmit, formRef } = useFormAction(addInstallment, { resetOnSuccess: true });
  return (
    <form ref={formRef} onSubmit={onSubmit} className={`${ROW} mt-1 border-t border-dashed border-line-strong pt-3`}>
      <input type="hidden" name="session_id" value={sessionId} />
      <Input
        key={`n${next.number}`}
        name="number"
        inputMode="numeric"
        pattern="[0-9]*"
        defaultValue={next.number}
        aria-label="New installment number"
        className="px-1.5 text-center"
      />
      <Input key={`m${next.number}`} name="name" defaultValue={next.name} aria-label="New installment name" placeholder="Installment name" />
      <Input
        key={`d${next.number}`}
        name="due_date"
        type="date"
        defaultValue={next.due_date}
        aria-label="New installment due date"
        required
        className="col-start-2 sm:col-start-auto"
      />
      <span className="hidden sm:block" />
      <div className="col-start-2 sm:col-start-auto">
        <Button type="submit" size="sm" disabled={pending}>
          <Plus className="size-4" aria-hidden /> {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {(state.error || state.message) && (
        <div className="col-span-full">
          <FormError message={state.error} />
          {state.ok && <p className="text-[12.5px] text-good-ink">{state.message}</p>}
        </div>
      )}
    </form>
  );
}

function EditSessionForm({ session }: { session: SessionInfo }) {
  const { state, pending, onSubmit } = useFormAction(updateSession);
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="session_id" value={session.id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`sn-${session.id}`}>
          <Input id={`sn-${session.id}`} name="name" defaultValue={session.name} required />
        </Field>
        <Field label="Starts" htmlFor={`ss-${session.id}`}>
          <Input id={`ss-${session.id}`} name="start_date" type="date" defaultValue={session.start_date} required />
        </Field>
        <Field label="Ends" htmlFor={`se-${session.id}`}>
          <Input id={`se-${session.id}`} name="end_date" type="date" defaultValue={session.end_date} required />
        </Field>
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : null} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save session details"}
      </Button>
    </form>
  );
}

function DeleteSessionForm({ session }: { session: SessionInfo }) {
  const { state, pending, onSubmit } = useFormAction(deleteSession);
  const blockers = [
    session.enrollments ? plural(session.enrollments, "enrolment") : null,
    session.payments ? plural(session.payments, "payment") : null,
    session.charges ? plural(session.charges, "fee charge") : null,
  ].filter(Boolean) as string[];
  return (
    <form onSubmit={onSubmit} className="space-y-2 border-t border-line pt-3">
      <input type="hidden" name="session_id" value={session.id} />
      <p className="text-[12.5px] text-ink-2">
        {blockers.length
          ? `This session has ${listJoin(blockers)}, so it cannot be deleted. Sessions with data are kept for history.`
          : "This session has no students, payments or charges yet, so it can be deleted. Its installments and fee structure go with it."}
      </p>
      <FormError message={state.error} />
      <Button
        type="submit"
        size="sm"
        variant={blockers.length ? "secondary" : "danger"}
        disabled={pending || blockers.length > 0}
        data-confirm={`Delete session ${session.name} with its installments and fee structure? This cannot be undone.`}
      >
        <Trash2 className="size-4" aria-hidden /> {pending ? "Deleting…" : "Delete session"}
      </Button>
    </form>
  );
}
