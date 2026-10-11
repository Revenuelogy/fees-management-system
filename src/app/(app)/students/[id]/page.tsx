import Link from "next/link";
import { notFound } from "next/navigation";
import { IndianRupee, Pencil, Phone, Receipt } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, fmtDate, fmtDateTime, pct, ratioPct, rupees } from "@/lib/format";
import type { Student360 } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FeeStatusBadge } from "@/components/ui/status";
import { AllocLines, KIND_LEGEND } from "@/components/ui/alloc";
import { Legend, Meter, StackedBar } from "@/components/ui/bars";
import { Segmented } from "@/components/ui/segmented";
import { Empty } from "@/components/ui/empty";
import { cn } from "@/lib/cn";
import { NoteForm, DeleteNoteButton } from "./note-form";

export const metadata = { title: "Student" };

const INST_STATUS = {
  paid: { label: "Paid", tone: "good" },
  partial: { label: "Part paid", tone: "warning" },
  partial_overdue: { label: "Part paid · overdue", tone: "serious" },
  overdue: { label: "Overdue", tone: "critical" },
  upcoming: { label: "Upcoming", tone: "neutral" },
  waived: { label: "Waived", tone: "neutral" },
} as const;

const PROFILE = {
  early: { label: "Pays early", hint: "Usually pays before the due date" },
  on_time: { label: "Pays on time", hint: "Usually pays within about two weeks of the due date" },
  late: { label: "Pays late", hint: "Usually pays more than two weeks after the due date" },
  year_end: { label: "Pays at year end", hint: "Most money arrives in January–March, well after due dates" },
  no_history: { label: "No payment history", hint: "Nothing paid against fees yet" },
} as const;

export default async function Student360Page({ params, searchParams }: PageProps<"/students/[id]">) {
  const viewer = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("student_360", { p_student: id });
  if (error?.message?.includes("not found")) notFound();
  if (error || !data) throw new Error(error?.message ?? "Could not load student");
  const d = data as Student360;
  const st = d.student;
  const writer = canWrite(viewer.role);
  const b = d.balance;
  const currentEnr = d.enrollments.find((e) => e.is_current) ?? d.enrollments[0];
  const ladderSessionId = param(sp.session) ?? d.sessions.find((s) => s.is_current)?.session_id ?? d.sessions[0]?.session_id;
  const ladder = d.sessions.find((s) => s.session_id === ladderSessionId);
  const prevSessions = d.sessions.filter((s) => !s.is_current && s.remaining !== 0);
  const totalOutstanding = d.sessions.reduce((a, s) => a + s.remaining, 0);
  const lp = d.last_payment;
  const concession = b?.concession ?? 0;

  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {st.full_name}
            <FeeStatusBadge status={d.fee_status} />
            {st.status !== "active" && <Badge>{st.status === "left" ? `Left ${fmtDate(st.left_on)}` : "Passed out"}</Badge>}
          </span>
        }
        description={
          <>
            {st.admission_no}
            {currentEnr && <> · {currentEnr.class_name}-{currentEnr.section}{currentEnr.roll_no ? `, roll ${currentEnr.roll_no}` : ""} ({currentEnr.session_name})</>}
            {st.father_name && <> · Father {st.father_name}</>}
            {st.mother_name && <> · Mother {st.mother_name}</>}
          </>
        }
        crumbs={[
          { label: "Students", href: "/students" },
          ...(currentEnr ? [{ label: currentEnr.class_name, href: `/classes/${currentEnr.class_id}` }] : []),
          { label: st.full_name },
        ]}
        actions={
          <>
            {st.phone && (
              <a href={`tel:${st.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm hover:bg-surface-2">
                <Phone className="size-4" /> {st.phone}
              </a>
            )}
            {writer && (
              <>
                <LinkButton href={`/students/${id}/fees`}>
                  <Receipt className="size-4" /> Fee plan
                </LinkButton>
                <LinkButton href={`/students/${id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </LinkButton>
                <LinkButton href={`/collect/${id}`} variant="primary">
                  <IndianRupee className="size-4" /> Collect fee
                </LinkButton>
              </>
            )}
          </>
        }
      />

      {/* The four answers in plain words */}
      {b && (
        <Card className="mb-4" bodyClassName="p-4 sm:p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <div className="text-[13px] text-ink-2">Supposed to pay ({b.session_name})</div>
              <div className="mt-0.5 text-2xl font-semibold">{rupees(b.expected)}</div>
              <div className="text-[12.5px] text-ink-2">
                {concession > 0 && <>after {rupees(concession)} concession · </>}
                {b.prev_opening > 0 ? <>plus {rupees(b.prev_opening)} old dues at session start</> : "no old dues at session start"}
              </div>
            </div>
            <div>
              <div className="text-[13px] text-ink-2">Has paid</div>
              <div className="mt-0.5 text-2xl font-semibold">{rupees(b.received + b.prev_recovered)}</div>
              <div className="text-[12.5px] text-ink-2">
                {rupees(b.received)} to this session · {rupees(b.prev_recovered)} to old dues
              </div>
              <Meter value={ratioPct(b.received + b.prev_recovered, b.expected + b.prev_opening)} className="mt-1.5" />
            </div>
            <div>
              <div className="text-[13px] text-ink-2">Recent payment went to</div>
              {lp ? (
                <>
                  <div className="mt-0.5 text-2xl font-semibold">{rupees(lp.amount)}</div>
                  <div className="text-[12.5px] text-ink-2">
                    on {fmtDate(lp.paid_on)}:{" "}
                    {[lp.current > 0 && `${rupees(lp.current)} current-year fees`, lp.arrears > 0 && `${rupees(lp.arrears)} old dues`, lp.advance > 0 && `${rupees(lp.advance)} advance`]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                  <StackedBar
                    height="h-1.5"
                    segments={[
                      { value: lp.current, className: "bg-series-1", label: "Current year", display: rupees(lp.current) },
                      { value: lp.arrears, className: "bg-series-2", label: "Previous dues", display: rupees(lp.arrears) },
                      { value: lp.advance, className: "bg-series-3", label: "Advance", display: rupees(lp.advance) },
                    ]}
                  />
                </>
              ) : (
                <div className="mt-0.5 text-[15px] font-medium text-critical-ink">No payment yet</div>
              )}
            </div>
            <div>
              <div className="text-[13px] text-ink-2">Still owes</div>
              <div className={cn("mt-0.5 text-2xl font-semibold", b.total_pending > 0 ? "text-critical-ink" : "text-good-ink")}>{rupees(b.total_pending)}</div>
              <div className="text-[12.5px] text-ink-2">
                {rupees(b.total_overdue)} overdue now
                {b.prev_pending > 0 && <> · incl. {rupees(b.prev_pending)} old dues</>}
                {b.advance_balance > 0 && <> · {rupees(b.advance_balance)} advance held</>}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card
            title="Installment ladder"
            description={ladder ? `${ladder.session_name}${ladder.class_name ? ` · ${ladder.class_name}-${ladder.section}` : ""}` : undefined}
            actions={
              d.sessions.length > 1 ? (
                <Segmented
                  options={d.sessions.map((s) => ({ label: s.session_name, href: `/students/${id}?session=${s.session_id}`, active: s.session_id === ladderSessionId }))}
                />
              ) : undefined
            }
          >
            {!ladder ? (
              <Empty title="No fee plan">
                {writer ? (
                  <>
                    Generate charges from the class fee structure on the <Link href={`/students/${id}/fees`} className="text-accent underline">fee plan</Link> page.
                  </>
                ) : (
                  "No charges have been set for this student."
                )}
              </Empty>
            ) : (
              <>
                <ol className="space-y-3">
                  {ladder.installments.map((i) => {
                    const s = INST_STATUS[i.status];
                    return (
                      <li key={i.installment_id} className="rounded-lg border border-line p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-medium text-ink">{i.name}</span>
                            <span className="text-[12.5px] text-muted"> · due {fmtDate(i.due_date)}</span>
                          </div>
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-[13px] tabular">
                          <div>
                            <div className="text-muted">Expected</div>
                            <div className="font-medium">{rupees(i.net)}</div>
                          </div>
                          <div>
                            <div className="text-muted">Paid</div>
                            <div className="font-medium">{rupees(i.paid)}</div>
                          </div>
                          <div>
                            <div className="text-muted">Pending</div>
                            <div className={cn("font-medium", i.remaining > 0 && i.due_date <= d.today && "text-critical-ink")}>{rupees(i.remaining)}</div>
                          </div>
                        </div>
                        <Meter value={ratioPct(i.paid, i.net)} className="mt-2" />
                        <details className="mt-2 text-[12.5px]">
                          <summary className="cursor-pointer text-ink-2 hover:text-ink">Fee heads</summary>
                          <table className="mt-1 w-full tabular">
                            <tbody>
                              {i.lines.map((l) => (
                                <tr key={l.charge_id} className="border-t border-line">
                                  <td className="py-1 pr-2 text-ink">{l.fee_head}</td>
                                  <td className="py-1 pr-2 text-right">{rupees(l.amount)}</td>
                                  <td className="py-1 pr-2 text-right text-muted">{l.concession > 0 ? `−${rupees(l.concession)}` : ""}</td>
                                  <td className="py-1 pr-2 text-right">paid {rupees(l.paid)}</td>
                                  <td className={cn("py-1 text-right", l.remaining > 0 ? "text-ink" : "text-muted")}>due {rupees(l.remaining)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-line pt-3 text-[13px] tabular">
                  <span>
                    Year: <b>{rupees(ladder.net)}</b> expected
                    {ladder.concession > 0 && <span className="text-muted"> (after {rupees(ladder.concession)} concession)</span>}
                  </span>
                  <span>
                    <b>{rupees(ladder.paid)}</b> paid · <b className={ladder.remaining > 0 ? "text-critical-ink" : ""}>{rupees(ladder.remaining)}</b> pending
                  </span>
                </div>
              </>
            )}
          </Card>

          <Card
            title="Payment history"
            description="Every receipt and exactly what it paid for. % = share of the outstanding balance (this and earlier sessions) that the payment cleared."
            actions={<Legend items={KIND_LEGEND} />}
          >
            {d.payments.length === 0 ? (
              <Empty title="No payments yet" />
            ) : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-[13.5px]">
                  <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Receipt</th>
                      <th className="px-3 py-2 text-right font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Paid for</th>
                      <th className="px-3 py-2 text-right font-medium">% of due</th>
                    </tr>
                  </thead>
                  <tbody className="tabular">
                    {d.payments.map((p) => (
                      <tr key={p.payment_id} className={cn("border-t border-line align-top", (p.cancelled || p.is_reversal) && "bg-surface-2/60")}>
                        <td className="whitespace-nowrap px-3 py-2">{fmtDate(p.paid_on)}</td>
                        <td className="px-3 py-2">
                          <Link href={`/payments/${p.payment_id}`} className="font-medium text-ink hover:text-accent hover:underline">
                            {p.receipt_no}
                          </Link>
                          <div className="text-[12px] text-muted">
                            {MODE_LABELS[p.mode]}
                            {p.reference_no ? ` · ${p.reference_no}` : ""}
                            {p.source === "import" ? " · imported" : ""}
                          </div>
                          {p.cancelled && <Badge tone="critical" className="mt-1">Cancelled</Badge>}
                          {p.is_reversal && (
                            <Badge tone="neutral" className="mt-1" title={p.remarks ?? undefined}>
                              Cancellation entry
                            </Badge>
                          )}
                        </td>
                        <td className={cn("whitespace-nowrap px-3 py-2 text-right font-medium", p.amount < 0 && "text-critical-ink", p.cancelled && "line-through decoration-1")}>
                          {rupees(p.amount)}
                        </td>
                        <td className="min-w-[230px] px-3 py-2">
                          <AllocLines lines={p.allocations} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {p.pct_of_outstanding !== null ? (
                            <span title={`Outstanding before this payment: ${rupees(p.outstanding_before)}`}>{pct(p.pct_of_outstanding)}</span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Dues by session">
            {d.sessions.length === 0 ? (
              <p className="text-sm text-ink-2">No charges.</p>
            ) : (
              <table className="w-full text-[13px] tabular">
                <thead className="text-left text-[12px] text-muted">
                  <tr>
                    <th className="pb-1 font-medium">Session</th>
                    <th className="pb-1 text-right font-medium">Fees</th>
                    <th className="pb-1 text-right font-medium">Paid</th>
                    <th className="pb-1 text-right font-medium">Unpaid</th>
                  </tr>
                </thead>
                <tbody>
                  {d.sessions.map((s) => (
                    <tr key={s.session_id} className="border-t border-line">
                      <td className="py-1.5">
                        {s.session_name}
                        <div className="text-[11.5px] text-muted">{s.class_name ?? "not enrolled"}</div>
                      </td>
                      <td className="py-1.5 text-right">{rupees(s.net)}</td>
                      <td className="py-1.5 text-right">{rupees(s.paid)}</td>
                      <td className={cn("py-1.5 text-right font-medium", s.remaining > 0 ? "text-critical-ink" : "text-muted")}>{rupees(s.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line-strong font-semibold">
                    <td className="py-1.5">Total outstanding</td>
                    <td />
                    <td />
                    <td className="py-1.5 text-right">{rupees(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            {prevSessions.length > 0 && (
              <p className="mt-2 text-[12.5px] text-ink-2">
                Old dues from {prevSessions.map((s) => s.session_name).join(", ")} are cleared first by new payments (oldest-first rule).
              </p>
            )}
          </Card>

          <Card title="Payment habit" description="Based on when money reached each installment, compared with its due date.">
            <div className="text-lg font-semibold">{PROFILE[d.behaviour.profile].label}</div>
            <p className="text-[13px] text-ink-2">{PROFILE[d.behaviour.profile].hint}</p>
            {d.behaviour.profile !== "no_history" && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                <div>
                  <dt className="text-muted">Avg. vs due</dt>
                  <dd className="font-medium tabular">
                    {d.behaviour.avg_days_from_due === null
                      ? "—"
                      : d.behaviour.avg_days_from_due <= 0
                        ? `${Math.abs(d.behaviour.avg_days_from_due)} d early`
                        : `${d.behaviour.avg_days_from_due} d late`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">On time</dt>
                  <dd className="font-medium tabular">{pct(d.behaviour.on_time_pct, 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Jan–Mar</dt>
                  <dd className="font-medium tabular">{pct(d.behaviour.year_end_pct, 0)}</dd>
                </div>
              </dl>
            )}
          </Card>

          <Card title="Notes & promises">
            {writer && <NoteForm studentId={id} />}
            <ul className={cn("space-y-3", writer && "mt-4")}>
              {d.notes.length === 0 && <li className="text-[13px] text-ink-2">No notes yet.</li>}
              {d.notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-line p-3 text-[13px]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="whitespace-pre-wrap text-ink">{n.note}</p>
                    {writer && <DeleteNoteButton id={n.id} studentId={id} />}
                  </div>
                  {(n.promised_date || n.promised_amount) && (
                    <p className={cn("mt-1 font-medium", n.promised_date && n.promised_date < d.today ? "text-critical-ink" : "text-ink-2")}>
                      Promised {n.promised_amount ? rupees(n.promised_amount) : "payment"}
                      {n.promised_date ? ` by ${fmtDate(n.promised_date)}` : ""}
                      {n.promised_date && n.promised_date < d.today ? " · date passed" : ""}
                    </p>
                  )}
                  <p className="mt-1 text-[12px] text-muted">
                    {n.author ?? "Staff"} · {fmtDateTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Contact & details">
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-muted">Phone</dt>
              <dd>{st.phone ?? "—"}{st.alt_phone ? `, ${st.alt_phone}` : ""}</dd>
              <dt className="text-muted">Email</dt>
              <dd className="break-all">{st.email ?? "—"}</dd>
              <dt className="text-muted">Address</dt>
              <dd>{st.address ?? "—"}</dd>
              <dt className="text-muted">Date of birth</dt>
              <dd>{fmtDate(st.dob)}</dd>
              <dt className="text-muted">Admitted</dt>
              <dd>{fmtDate(st.admission_date)}</dd>
              <dt className="text-muted">Classes</dt>
              <dd>{d.enrollments.map((e) => `${e.session_name}: ${e.class_name}-${e.section}`).join(" · ") || "—"}</dd>
              {st.remarks && (
                <>
                  <dt className="text-muted">Remarks</dt>
                  <dd>{st.remarks}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
