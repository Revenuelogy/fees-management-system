"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, IndianRupee, Pencil, Phone, PhoneCall, Sparkles, Wallet } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { MODE_LABELS, fmtDate, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import { ATTITUDE_LABELS, BEHAVIOUR_LABELS, ECONOMIC_LABELS, OUTCOME_LABELS, RELATION_LABELS, RESPONSE_LABELS, TIMING_LABELS, fmtPhone } from "@/lib/recovery";
import type { Parent360 } from "@/lib/types";
import { MONEY } from "@/lib/glossary";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { FormSuccess } from "@/components/ui/form";
import { Drawer } from "@/components/ui/drawer";
import { FeeStatusBadge } from "@/components/ui/status";
import { Meter } from "@/components/ui/bars";
import { Avatar } from "@/components/ui/avatar";
import { IconTile } from "@/components/ui/kpi";
import { Ring } from "@/components/ui/ring";
import { Empty } from "@/components/ui/empty";
import { BehaviourBadge, EconomicBadge, ParticipantBadge, PromiseBadge, PromiseLine } from "@/components/recovery";
import { CallForm } from "../call-form";
import { CallHistory } from "../call-history";

const HABIT = {
  early: "Pays before the due date",
  on_time: "Pays within two weeks of the due date",
  late: "Pays more than two weeks late",
  year_end: "Pays most of it in January–March",
  no_history: "Nothing paid against fees yet",
} as const;

export function ParentView({ id }: { id: string }) {
  const { session, writer, viewer } = useApp();
  const res = useApi<Parent360>(apiUrl(`/api/parents/${id}`, { session: session?.id }));
  const [logOpen, setLogOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  if (!res.data) return <Pending queries={[res]} />;
  const d = res.data;
  const p = d.parent;
  const t = d.totals;
  const supposed = t ? t.expected + t.prev_opening : 0;
  const paid = t ? t.received + t.prev_recovered : 0;
  const lp = d.last_payment;
  const r = d.reliability;
  const closed = r.made - r.pending;
  const others = d.children.filter((c) => !c.in_session);
  const lastCall = d.calls[0];
  const latest = d.promises[0];

  return (
    <div className="space-y-5">
      <Breadcrumbs items={[{ label: "Parents", href: "/parents" }]} />

      <section className="rounded-[28px] bg-surface p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={p.name} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-title1 font-bold text-ink">{p.name}</h1>
              <FeeStatusBadge status={t?.family_status} />
              <BehaviourBadge value={p.payment_behaviour} />
              <EconomicBadge value={p.economic_status} />
              {p.attitude && p.attitude !== "neutral" && (
                <Badge tone={p.attitude === "difficult" ? "critical" : p.attitude === "demanding" ? "serious" : "good"}>{ATTITUDE_LABELS[p.attitude]}</Badge>
              )}
            </div>
            <p className="mt-1 text-subhead text-ink-2">
              {[
                RELATION_LABELS[p.relation],
                `${d.children.length} ${d.children.length === 1 ? "child" : "children"}`,
                p.occupation,
                p.best_time_to_call ? `Best time: ${p.best_time_to_call}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
            <div className="mt-3 space-y-1 text-footnote">
              {lastCall ? (
                <p className="text-ink-2">
                  <span className="font-medium text-ink">Last call {fmtDate(lastCall.call_date)}:</span> {OUTCOME_LABELS[lastCall.outcome]}
                  {lastCall.response ? ` · ${RESPONSE_LABELS[lastCall.response]}` : ""}
                  {lastCall.summary ? ` · “${lastCall.summary}”` : ""}
                  {lastCall.author ? ` (${lastCall.author})` : ""}
                </p>
              ) : (
                <p className="text-muted">Never called.</p>
              )}
              {latest && (
                <p>
                  <PromiseLine date={latest.promised_date} amount={latest.promised_amount} status={latest.status} timing={latest.timing} paid={latest.paid} />
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:max-w-[320px] sm:justify-end">
            <Button variant="primary" onClick={() => setLogOpen(true)}>
              <PhoneCall className="size-4" /> Log a call
            </Button>
            <a href={`tel:${p.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-4 text-subhead font-medium text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]">
              <Phone className="size-4" /> {fmtPhone(p.phone)}
            </a>
            {p.alt_phone && (
              <a href={`tel:${p.alt_phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill-2 px-3.5 text-footnote font-medium text-ink-2 hover:bg-fill">
                {fmtPhone(p.alt_phone)}
              </a>
            )}
            <LinkButton href={`/calls/${id}`} variant="plain" className="px-1">
              Call page
            </LinkButton>
            {writer && (
              <LinkButton href={`/parents/${id}/edit`}>
                <Pencil className="size-4" /> Edit
              </LinkButton>
            )}
          </div>
        </div>
        {saved && (
          <div className="mt-3">
            <FormSuccess message={saved} />
          </div>
        )}
      </section>

      {t && (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] bg-line shadow-card lg:grid-cols-4" aria-label="The family's fees">
          <Fig icon={Wallet} color="blue" label={t.prev_opening > 0 ? MONEY.total_fee_all.label : MONEY.total_fee.label} value={rupeesShort(supposed)}>
            {t.prev_opening > 0 ? (
              <>
                {rupeesShort(t.expected)} this year + {rupeesShort(t.prev_opening)} from previous years
              </>
            ) : (
              d.session?.name
            )}
            {t.concession > 0 && <> · {rupeesShort(t.concession)} concession</>}
          </Fig>
          <Fig icon={CheckCircle2} color="green" label={t.prev_opening > 0 ? MONEY.received_all.label : MONEY.received.label} value={rupeesShort(paid)}>
            <Meter value={ratioPct(paid, supposed)} className="mb-1 mt-0.5" color="bg-good" track="bg-good-soft" />
            {pct(ratioPct(paid, supposed), 0)} of the total
          </Fig>
          <Fig
            icon={AlertTriangle}
            color={t.total_overdue > 0 ? "red" : "green"}
            label={t.prev_pending > 0 ? MONEY.balance_all.label : MONEY.balance.label}
            value={rupeesShort(t.total_pending)}
            tone={t.total_pending > 0 ? "text-critical-ink" : "text-good-ink"}
          >
            {t.total_overdue > 0 ? <>{rupeesShort(t.total_overdue)} due till today (incl. previous years)</> : "Nothing due till today"}
            {t.prev_pending > 0 && <> · {rupeesShort(t.prev_pending)} of it from previous years</>}
          </Fig>
          <Fig icon={Clock} color="indigo" label="Last payment" value={lp ? rupeesShort(lp.amount) : "Never paid"} tone={lp ? undefined : "text-critical-ink"}>
            {lp ? (
              <>
                {fmtDate(lp.paid_on)} · {lp.student_name}
                {t.days_since_payment !== null && t.days_since_payment > 30 && <> · {t.days_since_payment} days ago</>}
              </>
            ) : (
              "No receipt on record"
            )}
          </Fig>
        </section>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Children" subtitle={d.session ? `Fees in ${d.session.name}, with each child's previous years' dues` : undefined}>
            {d.children.length === 0 ? (
              <Empty title="No children linked">
                {writer ? (
                  <Link href={`/parents/${id}/edit`} className="text-accent">
                    Add a child to this family
                  </Link>
                ) : (
                  "Students with this phone number join automatically."
                )}
              </Empty>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {d.children
                  .filter((c) => c.in_session)
                  .map((c) => (
                    <li key={c.student_id} className="rounded-2xl bg-fill-2 p-4">
                      <div className="flex items-start gap-3">
                        <Avatar name={c.full_name} size="md" />
                        <div className="min-w-0 flex-1">
                          <Link href={`/students/${c.student_id}`} className="block truncate text-subhead font-semibold text-ink hover:text-accent">
                            {c.full_name}
                          </Link>
                          <p className="truncate text-caption text-muted">
                            {[c.class_name ? `${c.class_name} · ${c.section}` : "Not enrolled", c.admission_no, c.status !== "active" ? c.status.replace("_", " ") : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                        <FeeStatusBadge status={c.fee_status} />
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
                        <ChildFig label={MONEY.total_fee.short} value={c.expected} />
                        <ChildFig label={MONEY.received.short} value={c.received} tone="text-good-ink" />
                        <ChildFig label={MONEY.due_now.short} value={c.overdue} tone={c.overdue > 0 ? "text-critical-ink" : undefined} />
                        <ChildFig label={MONEY.old_balance.short} value={c.prev_pending} tone={c.prev_pending > 0 ? "text-serious-ink" : undefined} />
                      </dl>
                      <Meter value={c.paid_pct} className="mt-2.5" color={c.total_overdue > 0 ? "bg-series-1" : "bg-good"} track="bg-surface" />
                      <p className="mt-1.5 text-caption text-muted">
                        {rupeesShort(c.pending)} remaining this year
                        {c.total_overdue > 0 && <> · {rupeesShort(c.total_overdue)} total due incl. previous years</>}
                      </p>
                      {writer && c.total_pending > 0 && (
                        <div className="mt-3">
                          <LinkButton href={`/collect/${c.student_id}`} size="sm" variant="primary">
                            <IndianRupee className="size-3.5" /> Collect
                          </LinkButton>
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            )}
            {others.length > 0 && (
              <p className="mt-4 text-footnote text-ink-2">
                Also in this family:{" "}
                {others.map((c, i) => (
                  <span key={c.student_id}>
                    {i > 0 && ", "}
                    <Link href={`/students/${c.student_id}`} className="font-medium text-accent hover:underline">
                      {c.full_name}
                    </Link>{" "}
                    <span className="text-muted">({c.status === "active" ? "not in this session" : c.status.replace("_", " ")})</span>
                  </span>
                ))}
              </p>
            )}
          </Card>

          <Card title="Calls" description="Every call with what was said. A promise is kept when the family pays by the date (plus the grace days set in Settings).">
            <CallHistory parentId={id} calls={d.calls} canDelete={writer} />
          </Card>

          <Card title="Payments" description="Receipts of all the children, newest first.">
            {d.payments.length === 0 ? (
              <Empty title="No payments yet" />
            ) : (
              <ul className="divide-y divide-line">
                {d.payments.slice(0, 30).map((pay) => (
                  <li key={pay.payment_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-subhead">
                    <span className="w-24 shrink-0 text-footnote text-muted">{fmtDate(pay.paid_on)}</span>
                    <span className="min-w-0 flex-1">
                      <Link href={`/payments/${pay.payment_id}`} className="font-medium text-accent">
                        {pay.receipt_no}
                      </Link>{" "}
                      <span className="text-ink-2">· {pay.full_name}</span>
                      <span className="block text-caption text-muted">
                        {MODE_LABELS[pay.mode]}
                        {pay.arrears > 0 && <> · {rupees(pay.arrears)} went to previous years&apos; dues</>}
                        {pay.advance > 0 && <> · {rupees(pay.advance)} paid in advance</>}
                        {pay.cancelled && <span className="font-semibold text-critical-ink"> · cancelled</span>}
                        {pay.is_reversal && <span className="font-semibold text-ink-2"> · cancellation</span>}
                      </span>
                    </span>
                    <span className={cn("font-semibold tabular", pay.amount < 0 && "text-critical-ink", pay.cancelled && "line-through decoration-1")}>{rupees(pay.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="About the family" actions={writer ? <Link href={`/parents/${id}/edit`} className="text-footnote font-medium text-accent">Edit</Link> : undefined}>
            <dl className="space-y-3 text-subhead">
              {[
                ["Economic condition", p.economic_status ? ECONOMIC_LABELS[p.economic_status] : null],
                ["Deals with the school", p.attitude ? ATTITUDE_LABELS[p.attitude] : null],
                ["Main concern about the child", p.concerns],
                ["What matters most to them", p.priorities],
                ["How they behave / what they talk about", p.behaviour_notes],
                ["Best time to call", p.best_time_to_call],
                ["Remarks", p.remarks],
                ["Email", p.email],
                ["Address", p.address],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-caption font-medium text-muted">{k}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-ink">{v}</dd>
                  </div>
                ))}
              {!p.economic_status && !p.concerns && !p.behaviour_notes && !p.priorities && (
                <p className="text-footnote text-muted">
                  Nothing recorded yet. Note their economic condition, concerns and how they behave, so whoever calls next has the context.
                </p>
              )}
            </dl>
          </Card>


          <Card title="Keeps promises?" description="Promises from calls and student notes. Kept = paid (the promised amount, if one was given) by the date plus the grace days.">
            {r.made === 0 ? (
              <p className="text-footnote text-muted">No promises yet.</p>
            ) : (
              <>
                <div className="flex items-center gap-5">
                  <Ring value={r.kept_pct} size={92} stroke={10} color={(r.kept_pct ?? 0) >= 60 ? "var(--good)" : "var(--serious)"} label={`${pct(r.kept_pct, 0)} kept`}>
                    <span className="figure text-title3 text-ink">{closed > 0 ? `${r.kept_pct ?? 0}%` : "—"}</span>
                  </Ring>
                  <dl className="grid flex-1 grid-cols-2 gap-x-3 gap-y-1.5 text-footnote">
                    {[
                      ["Before the date", r.early],
                      ["On the date", r.on_date],
                      ["Within grace", r.grace],
                      ["Partly kept", r.partial],
                      ["Broken", r.broken],
                      ["Waiting", r.pending],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex justify-between gap-2">
                        <dt className="text-ink-2">{k}</dt>
                        <dd className="font-semibold tabular text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <ul className="mt-4 space-y-2 border-t border-line pt-3">
                  {d.promises.slice(0, 6).map((x) => (
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
              </>
            )}
          </Card>

          <Card title="Payment habit" description="What the staff recorded, next to what the payment records show for all the children.">
            <div className="space-y-3">
              <div>
                <p className="text-caption font-medium text-muted">Staff say</p>
                {p.payment_behaviour ? (
                  <p className="mt-0.5 text-headline font-semibold text-ink">{BEHAVIOUR_LABELS[p.payment_behaviour].label}</p>
                ) : (
                  <p className="mt-0.5 text-subhead text-ink-2">Not recorded yet</p>
                )}
              </div>
              <div>
                <p className="text-caption font-medium text-muted">Records show</p>
                <p className="mt-0.5 text-subhead text-ink">{HABIT[d.behaviour.profile]}</p>
                {d.behaviour.carried_forward && <p className="text-footnote text-serious-ink">Has dues from previous years carried into {d.session?.name ?? "this year"}</p>}
                {d.behaviour.suggested && d.behaviour.suggested !== p.payment_behaviour && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-footnote text-accent">
                    <Sparkles className="size-3.5" aria-hidden /> Looks like “{BEHAVIOUR_LABELS[d.behaviour.suggested].label}”
                    {writer && (
                      <Link href={`/parents/${id}/edit?habit=${d.behaviour.suggested}`} className="font-semibold underline-offset-4 hover:underline">
                        Use it
                      </Link>
                    )}
                  </p>
                )}
              </div>
              {d.behaviour.profile !== "no_history" && (
                <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-fill-2 p-3 text-center">
                  <div>
                    <dd className="text-headline font-semibold tabular">
                      {d.behaviour.avg_days_from_due === null ? "—" : d.behaviour.avg_days_from_due <= 0 ? `${Math.abs(d.behaviour.avg_days_from_due)}d` : `+${d.behaviour.avg_days_from_due}d`}
                    </dd>
                    <dt className="text-caption text-muted">vs due date</dt>
                  </div>
                  <div>
                    <dd className="text-headline font-semibold tabular">{pct(d.behaviour.on_time_pct, 0)}</dd>
                    <dt className="text-caption text-muted">on time</dt>
                  </div>
                  <div>
                    <dd className="text-headline font-semibold tabular">{d.behaviour.payments_per_year ?? "—"}</dd>
                    <dt className="text-caption text-muted">payments / year</dt>
                  </div>
                </dl>
              )}
            </div>
          </Card>


          {d.sessions.length > 0 && (
            <Card title="By session" description="What is left to pay for each year. What is left from previous years is shown as previous years' dues.">
              <ul className="space-y-3">
                {d.sessions.map((s) => (
                  <li key={s.session_id}>
                    <div className="flex items-baseline justify-between gap-2 text-subhead">
                      <span className="font-medium text-ink">{s.session_name}</span>
                      <span className={cn("font-semibold tabular", s.remaining > 0 ? (s.is_current ? "text-ink" : "text-serious-ink") : "text-good-ink")}>
                        {s.remaining > 0 ? rupeesShort(s.remaining) : "Clear"}
                      </span>
                    </div>
                    <Meter value={ratioPct(s.paid, s.net)} className="mt-1.5" color={s.remaining > 0 ? "bg-series-1" : "bg-good"} track="bg-fill-2" />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {d.activities.length > 0 && (
            <Card title="Recovery activities" description="Activities the children took part in, and whether fees came in because of them.">
              <ul className="space-y-2.5">
                {d.activities.map((a) => (
                  <li key={a.participant_id} className="rounded-2xl bg-fill-2 p-3.5 text-subhead">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/activities/${a.activity_id}`} className="font-medium text-ink hover:text-accent">
                        {a.name}
                      </Link>
                      <ParticipantBadge response={a.response} />
                    </div>
                    <p className="mt-1 text-caption text-muted">
                      {a.student_name} · from {fmtDate(a.start_date)}
                      {a.credited > 0 && <> · {rupees(a.credited)} deposited</>}
                      {a.status === "closed" && <> · closed</>}
                    </p>
                    {a.note && <p className="mt-1 text-footnote text-ink-2">{a.note}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Drawer
        open={logOpen}
        onClose={() => setLogOpen(false)}
        title={`Log a call · ${p.name}`}
        description={`Logged by ${viewer.full_name || viewer.email}. About anything: fees, studies, a PTM or a parent's question.`}
      >
        <CallForm
          parentId={id}
          today={d.today}
          graceDays={d.grace_days}
          onSaved={(message) => {
            setLogOpen(false);
            setSaved(message ?? "Call saved.");
          }}
        />
      </Drawer>
    </div>
  );
}

/** One figure of the family's fees in the strip under the header. */
function Fig({
  icon,
  color,
  label,
  value,
  tone,
  children,
}: {
  icon: React.ElementType;
  color: "blue" | "green" | "red" | "indigo";
  label: string;
  value: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface p-4 sm:p-5">
      <p className="flex items-center gap-2 text-footnote font-medium text-ink-2">
        <IconTile icon={icon} color={color} size="sm" /> {label}
      </p>
      <p className={cn("figure mt-2 text-title1 leading-none", tone ?? "text-ink")}>{value}</p>
      <div className="mt-2 text-caption text-ink-2">{children}</div>
    </div>
  );
}

function ChildFig({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted">{label}</dt>
      <dd className={cn("text-subhead font-semibold tabular", tone ?? "text-ink")}>{rupeesShort(value)}</dd>
    </div>
  );
}
