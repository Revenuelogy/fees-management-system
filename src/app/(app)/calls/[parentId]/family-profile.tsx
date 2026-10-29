"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import useSWR from "swr";
import { Phone } from "lucide-react";
import { apiFetch, type ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { MODE_LABELS, fmtDate, fmtDateShort, fmtDateTime, rupees, rupeesShort } from "@/lib/format";
import { MONEY } from "@/lib/glossary";
import {
  ATTITUDE_LABELS, BEHAVIOUR_LABELS, ECONOMIC_LABELS, PARTICIPANT_LABELS, PARTICIPANT_RESPONSES, RELATION_LABELS, TIMING_LABELS, fmtPhone,
} from "@/lib/recovery";
import type { ActionState } from "@/lib/action-state";
import type { Parent360, Student360, Student360Installment } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { FeeStatusBadge } from "@/components/ui/status";
import { ParticipantBadge, PromiseBadge } from "@/components/recovery";
import { paymentNote, paymentSplit } from "@/components/payment-note";
import { useFormAction } from "../../setup/_lib/use-form-action";
import { saveResponse } from "../../activities/actions";
import { addNote } from "../../students/[id]/note-actions";
import { CallHistory } from "../../parents/call-history";

/** Each child's full profile (fees, installments, receipts, notes), fetched together. */
function useChildren(ids: string[]) {
  return useSWR<Student360[], ApiError>(ids.length ? ["family-360", ...ids] : null, () =>
    Promise.all(ids.map((id) => apiFetch<Student360>(`/api/students/${id}/360`))),
  );
}

/** "Due till today" / "Due later" / "Paid" for an installment (previous years' unpaid ones are "Previous years' dues"). */
function installmentState(i: Student360Installment, current: boolean): { label: string; tone: "good" | "critical" | "warning" | "serious" | "neutral" } {
  if (i.status === "waived") return { label: "Waived", tone: "neutral" };
  if (i.status === "paid") return { label: "Paid", tone: "good" };
  if (!current) return { label: MONEY.old_balance.label, tone: "serious" };
  if (i.status === "overdue" || i.status === "partial_overdue") return { label: MONEY.due_now.label, tone: "critical" };
  return { label: MONEY.due_later.label, tone: "warning" };
}

/**
 * Everything about a family, read-only, for the person calling it: the family, each child's fees, installments
 * and receipts, promises, activities (with the family's response), earlier calls and notes.
 */
export function FamilyProfile({ f, parentId }: { f: Parent360; parentId: string }) {
  const p = f.parent;
  const kids = f.children.filter((k) => k.status === "active" || k.total_pending > 0 || k.in_session);
  const res = useChildren(kids.map((k) => k.student_id));
  const byId = new Map((res.data ?? []).map((d) => [d.student.id, d]));
  const notes = (res.data ?? [])
    .flatMap((d) => d.notes.map((n) => ({ ...n, student_name: d.student.full_name })))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="space-y-5">
      {/* 1 · Family */}
      <Card title="Family" actions={<Link href={`/parents/${parentId}`} className="text-footnote font-medium text-accent">Parent profile</Link>}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Item label="Parent">
            {p.name} <span className="text-ink-2">({RELATION_LABELS[p.relation]})</span>
          </Item>
          <Item label="Phone on file">
            <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 text-accent">
              <Phone className="size-3.5" /> {fmtPhone(p.phone)}
            </a>
            {p.alt_phone && (
              <a href={`tel:${p.alt_phone}`} className="ml-3 inline-flex items-center gap-1 text-accent">
                <Phone className="size-3.5" /> {fmtPhone(p.alt_phone)}
              </a>
            )}
          </Item>
          <Item label="Best time to call">{p.best_time_to_call ?? "—"}</Item>
          <Item label="Payment habit">{p.payment_behaviour ? BEHAVIOUR_LABELS[p.payment_behaviour].label : "—"}</Item>
          <Item label="Economic condition">{p.economic_status ? ECONOMIC_LABELS[p.economic_status] : "—"}</Item>
          <Item label="How they deal with the school">{p.attitude ? ATTITUDE_LABELS[p.attitude] : "—"}</Item>
          {[
            ["How they like to be contacted, how they behave", p.behaviour_notes],
            ["Main concern about the child", p.concerns],
            ["What matters most to them", p.priorities],
            ["Remarks", p.remarks],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Item key={k as string} label={k as string} wide>
                <span className="whitespace-pre-wrap">{v}</span>
              </Item>
            ))}
        </dl>
      </Card>

      {/* 2 · Children */}
      <Card title="Children" description={`${MONEY.balance.label}: ${MONEY.balance.hint}. ${MONEY.due_now.label}: ${MONEY.due_now.hint}. ${MONEY.old_balance.label}: ${MONEY.old_balance.hint}.`}>
        {kids.length === 0 ? (
          <p className="text-footnote text-muted">No child is linked to this family.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {kids.map((k) => {
              const d = byId.get(k.student_id);
              const note = d?.last_payment ? paymentNote(d.last_payment, { sessionName: d.balance?.session_name, receivedThisYear: d.balance?.received }) : null;
              return (
                <li key={k.student_id} className="rounded-2xl bg-fill-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/students/${k.student_id}`} className="text-subhead font-semibold text-ink hover:text-accent">
                      {k.full_name}
                    </Link>
                    <FeeStatusBadge status={k.fee_status} />
                  </div>
                  <p className="text-caption text-muted">
                    {k.class_name ? `${k.class_name} · ${k.section}` : "Not enrolled"} · {k.admission_no}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <Amount label={MONEY.total_fee.short} value={k.expected} />
                    <Amount label={MONEY.balance.short} value={k.pending} />
                    <Amount label={MONEY.due_now.short} value={k.overdue} tone={k.overdue > 0 ? "text-critical-ink" : undefined} />
                    <Amount label={MONEY.old_balance.short} value={k.prev_pending} tone={k.prev_pending > 0 ? "text-serious-ink" : undefined} />
                  </dl>
                  <p className="mt-2 text-footnote text-ink-2">
                    Last payment:{" "}
                    {d?.last_payment ? (
                      <>
                        {rupees(d.last_payment.amount)} on {fmtDate(d.last_payment.paid_on)}
                      </>
                    ) : k.last_paid_on ? (
                      fmtDate(k.last_paid_on)
                    ) : (
                      "never"
                    )}
                  </p>
                  {note && <p className="mt-1 text-footnote text-ink">{note}</p>}
                  <Link href={`/students/${k.student_id}`} className="mt-2 inline-flex min-h-8 items-center text-footnote font-medium text-accent">
                    Full profile
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* 3 · Installments */}
      <Card title="Installments">
        {res.error ? (
          <FormError message="Couldn't load the installments. Try again later." />
        ) : !res.data ? (
          <Loading />
        ) : (
          <div className="space-y-4">
            {res.data.map((d) => {
              const rows = d.sessions.flatMap((s) =>
                s.installments.filter((i) => s.is_current || i.remaining > 0).map((i) => ({ ...i, session: s.session_name, current: s.is_current })),
              );
              return (
                <div key={d.student.id}>
                  <p className="mb-1.5 text-footnote font-semibold text-ink">{d.student.full_name}</p>
                  {rows.length === 0 ? (
                    <p className="text-footnote text-muted">No fees assigned.</p>
                  ) : (
                    <ul className="divide-y divide-line rounded-xl bg-fill-2">
                      {rows.map((i) => {
                        const st = installmentState(i, i.current);
                        return (
                          <li key={`${i.session}-${i.installment_id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-footnote">
                            <span className="min-w-0">
                              <span className="font-medium text-ink">
                                {i.current ? "" : `${i.session} · `}
                                {i.name}
                              </span>
                              <span className="block text-caption text-muted">due {fmtDate(i.due_date)}</span>
                            </span>
                            <span className="flex items-center gap-2 tabular">
                              <span className="text-ink">{rupees(i.net)}</span>
                              {i.remaining > 0 && i.remaining < i.net && <span className="text-caption text-muted">{rupees(i.remaining)} left</span>}
                              <Badge tone={st.tone}>{st.label}</Badge>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 4 · Payments */}
      <Card title="Payments">
        {res.error ? (
          <FormError message="Couldn't load the receipts. Try again later." />
        ) : !res.data ? (
          <Loading />
        ) : (
          <div className="space-y-4">
            {res.data.map((d) => {
              const receipts = d.payments.filter((x) => !x.is_reversal).slice(0, 12);
              return (
                <div key={d.student.id}>
                  <p className="mb-1.5 text-footnote font-semibold text-ink">{d.student.full_name}</p>
                  {receipts.length === 0 ? (
                    <p className="text-footnote text-muted">Nothing paid yet.</p>
                  ) : (
                    <ul className="divide-y divide-line rounded-xl bg-fill-2">
                      {receipts.map((x) => {
                        const split = paymentSplit(x);
                        return (
                          <li key={x.payment_id} className="px-3 py-2 text-footnote">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="text-ink">
                                {fmtDate(x.paid_on)} · {MODE_LABELS[x.mode] ?? x.mode} · <span className="text-muted">{x.receipt_no}</span>
                              </span>
                              <span className={cn("font-semibold tabular", x.cancelled ? "text-muted line-through" : "text-ink")}>{rupees(x.amount)}</span>
                            </div>
                            {x.cancelled ? (
                              <p className="text-caption text-critical-ink">Cancelled</p>
                            ) : split ? (
                              <p className="text-caption text-ink-2">{split}</p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 5 · Promises */}
      <Card title="Promises" description={`Kept = paid by the promised date, or within ${f.grace_days} grace ${f.grace_days === 1 ? "day" : "days"} after it.`}>
        {f.promises.length === 0 ? (
          <p className="text-footnote text-muted">No promises yet.</p>
        ) : (
          <ul className="space-y-2">
            {f.promises.map((x) => (
              <li key={x.source_id} className="flex items-start justify-between gap-2 text-footnote">
                <span className="min-w-0">
                  <span className="font-medium text-ink">
                    {x.promised_amount ? rupees(x.promised_amount) : "Payment"} by {fmtDate(x.promised_date)}
                  </span>
                  <span className="block text-caption text-muted">
                    {x.source === "note" ? `Note on ${x.student_name ?? "a child"}` : "Call"} · made {fmtDate(x.made_on)}
                    {x.kept_on && x.timing && <> · {TIMING_LABELS[x.timing]}</>}
                    {x.status === "partial" && <> · {rupees(x.paid)} paid</>}
                  </span>
                </span>
                <PromiseBadge status={x.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 6 · Activities */}
      <Card title="Activities" description="Activities the children take part in, and the family's response. Record what they said after a call.">
        {f.activities.length === 0 ? (
          <p className="text-footnote text-muted">The children are not in any activity.</p>
        ) : (
          <ul className="space-y-3">
            {f.activities.map((a) => (
              <ActivityResponse key={a.participant_id} a={a} />
            ))}
          </ul>
        )}
      </Card>

      {/* 7 · Call history */}
      <Card title="Call history">
        <CallHistory parentId={parentId} calls={f.calls} canDelete={false} />
      </Card>

      {/* 8 · Notes */}
      <Card title="Notes" description="Notes staff added on the children's profiles. A note can carry a promise to pay.">
        {kids.length > 0 && <FamilyNoteForm kids={kids.map((k) => ({ id: k.student_id, name: k.full_name }))} />}
        {res.data && notes.length === 0 && <p className="mt-3 text-footnote text-muted">No notes yet.</p>}
        <ul className="mt-4 space-y-2.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl bg-fill-2 p-3 text-footnote">
              <p className="whitespace-pre-wrap text-ink">{n.note}</p>
              {n.promised_date && (
                <p className="mt-1 font-medium text-ink">
                  Promised {n.promised_amount ? rupees(n.promised_amount) : "to pay"} by {fmtDate(n.promised_date)}
                </p>
              )}
              <p className="mt-1 text-caption text-muted">
                {n.student_name} · {n.author ?? "Staff"} · {fmtDateTime(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Item({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-caption font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-subhead text-ink">{children}</dd>
    </div>
  );
}

function Amount({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-surface px-1 py-2">
      <dd className={cn("text-subhead font-semibold tabular", tone ?? "text-ink")}>{rupeesShort(value)}</dd>
      <dt className="text-caption text-muted">{label}</dt>
    </div>
  );
}

function Loading() {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      <div className="h-4 w-3/4 animate-pulse rounded-full bg-fill-2" />
      <div className="h-4 w-1/2 animate-pulse rounded-full bg-fill-2" />
    </div>
  );
}

function ActivityResponse({ a }: { a: Parent360["activities"][number] }) {
  const { state, pending, onSubmit } = useFormAction(saveResponse);
  return (
    <li className="rounded-2xl bg-fill-2 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-subhead font-medium text-ink">{a.name}</span>
        <ParticipantBadge response={a.response} />
      </div>
      <p className="text-caption text-muted">
        {a.student_name} · from {fmtDateShort(a.start_date)}
        {a.end_date ? ` to ${fmtDateShort(a.end_date)}` : ""}
        {a.status === "closed" ? " · closed" : ""}
        {a.credited > 0 && <> · {rupees(a.credited)} paid because of it</>}
      </p>
      <form onSubmit={onSubmit} className="mt-2.5 grid items-end gap-2 sm:grid-cols-[minmax(0,200px)_1fr_auto]">
        <input type="hidden" name="activity_id" value={a.activity_id} />
        <input type="hidden" name="participant_id" value={a.participant_id} />
        <Field label="Response" htmlFor={`fr-${a.participant_id}`}>
          <Select id={`fr-${a.participant_id}`} name="response" defaultValue={a.response}>
            {PARTICIPANT_RESPONSES.map((x) => (
              <option key={x} value={x}>
                {PARTICIPANT_LABELS[x].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What the family said" htmlFor={`fn-${a.participant_id}`}>
          <Input id={`fn-${a.participant_id}`} name="note" defaultValue={a.note ?? ""} />
        </Field>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <div className="sm:col-span-3">
          <FormError message={state.error} />
          <FormSuccess message={state.ok ? state.message : null} />
        </div>
      </form>
    </li>
  );
}

function FamilyNoteForm({ kids }: { kids: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addNote, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-2">
      {kids.length === 1 ? (
        <input type="hidden" name="student_id" value={kids[0].id} />
      ) : (
        <Select name="student_id" aria-label="On which child's profile" defaultValue={kids[0].id}>
          {kids.map((k) => (
            <option key={k.id} value={k.id}>
              Note on {k.name}
            </option>
          ))}
        </Select>
      )}
      <Textarea name="note" rows={2} placeholder="What the family said, how they like to be contacted…" aria-label="Note" required />
      <div className="grid grid-cols-2 gap-2">
        <Input name="promised_date" type="date" aria-label="Promised date" title="Promised payment date (optional)" />
        <Input name="promised_amount" inputMode="decimal" placeholder="Promised ₹ (optional)" aria-label="Promised amount" />
      </div>
      <FormError message={state.error} />
      <FormSuccess message={state.ok ? "Note added." : null} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Add note"}
      </Button>
    </form>
  );
}
