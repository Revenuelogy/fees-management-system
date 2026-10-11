"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { collectPayment } from "./actions";
import type { ActionState } from "@/lib/action-state";
import type { DueLine, PaymentMode } from "@/lib/types";
import { MODE_LABELS, fmtDate, parseRupees, pct, rupees } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { StackedBar, Legend } from "@/components/ui/bars";
import { KIND_LEGEND } from "@/components/ui/alloc";
import { cn } from "@/lib/cn";

type SessionLite = { id: string; start: string; end: string; name: string };

/** Default allocation rule, mirroring the database engine (used for the preview; the DB stores what you confirm). */
function autoAllocate(amount: number, dues: DueLine[], order: "oldest_first" | "current_first", paySessionId: string | null) {
  const out = new Map<string, number>();
  let left = amount;
  const ordered =
    order === "current_first" && paySessionId
      ? [...dues.filter((d) => d.session_id === paySessionId), ...dues.filter((d) => d.session_id !== paySessionId)]
      : dues;
  for (const d of ordered) {
    if (left <= 0) break;
    const a = Math.min(d.remaining, left);
    if (a > 0) {
      out.set(d.charge_id, a);
      left -= a;
    }
  }
  return out;
}

const REF_LABEL: Partial<Record<PaymentMode, string>> = {
  cheque: "Cheque number & bank",
  upi: "UPI transaction ID",
  bank_transfer: "UTR / NEFT reference",
  card: "Card slip / approval code",
};

export function CollectForm({
  studentId,
  dues,
  today,
  advance,
  order,
  sessions,
  recent,
}: {
  studentId: string;
  dues: DueLine[];
  today: string;
  advance: number;
  order: "oldest_first" | "current_first";
  sessions: SessionLite[];
  recent: { id: string; receipt_no: string; paid_on: string; amount: number; cancelled: boolean }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(collectPayment, {});
  const [amountText, setAmountText] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [manual, setManual] = useState(false);
  const [lines, setLines] = useState<Record<string, string>>({});

  const paySession = sessions.find((s) => paidOn >= s.start && paidOn <= s.end) ?? null;
  const paySessionStart = paySession?.start ?? "";
  const amount = parseRupees(amountText) ?? 0;
  const totalDue = dues.reduce((a, d) => a + d.remaining, 0);
  const overdueLines = dues.filter((d) => d.is_overdue);
  const totalOverdue = overdueLines.reduce((a, d) => a + d.remaining, 0);

  const allocation = useMemo(() => {
    if (!manual) return autoAllocate(amount, dues, order, paySession?.id ?? null);
    const m = new Map<string, number>();
    for (const d of dues) {
      const v = parseRupees(lines[d.charge_id] ?? "");
      if (v && v > 0) m.set(d.charge_id, Math.min(v, d.remaining));
    }
    return m;
  }, [manual, amount, dues, order, paySession?.id, lines]);

  const allocated = [...allocation.values()].reduce((a, v) => a + v, 0);
  const unallocated = Math.max(0, amount - allocated);
  const kindOf = (d: DueLine) => (d.session_id === paySession?.id ? "current" : d.session_start < paySessionStart ? "arrears" : "advance");
  const split = { current: 0, arrears: 0, advance: 0 };
  for (const d of dues) {
    const a = allocation.get(d.charge_id) ?? 0;
    if (a > 0) split[kindOf(d)] += a;
  }
  if (!manual) split.advance += unallocated;
  const over = manual && allocated > amount;

  const groups = useMemo(() => {
    const g: { key: string; session: string; sessionId: string; sessionStart: string; inst: string; instNo: number; due: string; overdue: boolean; lines: DueLine[] }[] = [];
    for (const d of dues) {
      const key = `${d.session_id}|${d.installment_id}`;
      let grp = g.find((x) => x.key === key);
      if (!grp) {
        grp = { key, session: d.session_name, sessionId: d.session_id, sessionStart: d.session_start, inst: d.installment_name, instNo: d.installment_no, due: d.due_date, overdue: d.is_overdue, lines: [] };
        g.push(grp);
      }
      grp.lines.push(d);
    }
    return g;
  }, [dues]);

  function fillManual(selected: DueLine[], additive = false) {
    const next: Record<string, string> = additive ? { ...lines } : {};
    for (const d of selected) next[d.charge_id] = String(d.remaining / 100);
    setLines(next);
    setManual(true);
    const sum = dues.reduce((a, d) => a + Math.min(parseRupees(next[d.charge_id] ?? "") ?? 0, d.remaining), 0);
    setAmountText(String(sum / 100));
  }

  const targets = [...allocation.entries()].map(([charge_id, amt]) => ({ charge_id, amount: amt }));

  return (
    <form action={action} className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="targets" value={JSON.stringify(targets)} />

      <section className="rounded-xl border border-line bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Open dues</h2>
            <p className="text-[13px] text-ink-2">
              {rupees(totalDue)} unpaid in total · {rupees(totalOverdue)} overdue
              {advance > 0 && <> · {rupees(advance)} advance already held</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {totalOverdue > 0 && (
              <Button type="button" size="sm" onClick={() => fillManual(overdueLines)}>
                All overdue {rupees(totalOverdue)}
              </Button>
            )}
            {totalDue > 0 && (
              <Button type="button" size="sm" onClick={() => fillManual(dues)}>
                Everything {rupees(totalDue)}
              </Button>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px] sm:px-5">
          <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="Allocation mode">
            <button type="button" onClick={() => setManual(false)} aria-pressed={!manual}
              className={cn("rounded-md px-2.5 py-1", !manual ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2")}>
              Automatic ({order === "oldest_first" ? "oldest dues first" : "current session first"})
            </button>
            <button
              type="button"
              aria-pressed={manual}
              onClick={() => {
                if (!manual) {
                  const seed: Record<string, string> = {};
                  for (const [k, v] of allocation) seed[k] = String(v / 100);
                  setLines(seed);
                }
                setManual(true);
              }}
              className={cn("rounded-md px-2.5 py-1", manual ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2")}
            >
              Choose what it pays for
            </button>
          </div>
          <Legend items={KIND_LEGEND} />
        </div>

        {dues.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-2">No dues. Any amount collected now is kept as an advance for future fees.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] uppercase tracking-wide text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-2 font-medium sm:px-5">Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Due</th>
                  <th className="px-3 py-2 text-right font-medium">Paid</th>
                  <th className="px-3 py-2 text-right font-medium">Pending</th>
                  <th className="px-4 py-2 text-right font-medium sm:px-5">This payment</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {groups.map((g) => {
                  const kind = g.sessionId === paySession?.id ? "current" : g.sessionStart < paySessionStart ? "arrears" : "advance";
                  const grpPending = g.lines.reduce((a, l) => a + l.remaining, 0);
                  return (
                    <GroupRows
                      key={g.key}
                      title={`${g.session} · ${g.inst}`}
                      due={g.due}
                      overdue={g.overdue}
                      kind={kind}
                      pendingTotal={grpPending}
                      onFill={() => fillManual(g.lines, true)}
                    >
                      {g.lines.map((l) => {
                        const a = allocation.get(l.charge_id) ?? 0;
                        return (
                          <tr key={l.charge_id} className="border-t border-line/70">
                            <td className="px-4 py-1.5 pl-8 text-ink sm:px-5 sm:pl-9">
                              {l.fee_head}
                              {l.concession > 0 && <span className="ml-1 text-[12px] text-muted">(−{rupees(l.concession)} concession)</span>}
                            </td>
                            <td className="px-3 py-1.5 text-right text-ink-2">{rupees(l.net_amount)}</td>
                            <td className="px-3 py-1.5 text-right text-ink-2">{l.paid ? rupees(l.paid) : "—"}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{rupees(l.remaining)}</td>
                            <td className="px-4 py-1.5 text-right sm:px-5">
                              {manual ? (
                                <input
                                  inputMode="decimal"
                                  aria-label={`Amount for ${g.inst} ${l.fee_head}`}
                                  value={lines[l.charge_id] ?? ""}
                                  onChange={(e) => setLines((s) => ({ ...s, [l.charge_id]: e.target.value }))}
                                  placeholder="0"
                                  className="h-8 w-28 rounded-md border border-line-strong bg-surface px-2 text-right text-sm focus:border-accent focus:outline-none"
                                />
                              ) : (
                                <span className={a > 0 ? "font-semibold text-ink" : "text-muted"}>{a > 0 ? rupees(a) : "—"}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </GroupRows>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink">Payment</h2>
          <div className="space-y-3">
            <Field label="Amount received (₹)" htmlFor="amount">
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                autoFocus
                required
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="e.g. 15000"
                className="h-11 text-lg font-semibold"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="paid_on">
                <Input id="paid_on" name="paid_on" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
              </Field>
              <Field label="Mode" htmlFor="mode">
                <Select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
                  {Object.entries(MODE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {mode !== "cash" && (
              <Field label={REF_LABEL[mode] ?? "Reference"} htmlFor="reference_no">
                <Input id="reference_no" name="reference_no" required={mode !== "card" && mode !== "other"} />
              </Field>
            )}
            <Field label="Remarks (optional)" htmlFor="remarks">
              <Textarea id="remarks" name="remarks" rows={2} />
            </Field>
          </div>

          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px]">
            <div className="mb-2 font-medium text-ink">This payment pays for</div>
            <StackedBar
              segments={[
                { value: split.current, className: "bg-series-1", label: "Current year fees", display: rupees(split.current) },
                { value: split.arrears, className: "bg-series-2", label: "Previous dues", display: rupees(split.arrears) },
                { value: split.advance, className: "bg-series-3", label: "Advance", display: rupees(split.advance) },
              ]}
            />
            <dl className="mt-2 space-y-0.5 tabular">
              <div className="flex justify-between"><dt className="text-ink-2">Current-year fees</dt><dd>{rupees(split.current)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Previous dues</dt><dd>{rupees(split.arrears)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-2">Advance</dt><dd>{rupees(split.advance)}</dd></div>
              {manual && unallocated > 0 && (
                <div className="flex justify-between text-ink-2">
                  <dt>Not assigned (default rule / advance)</dt>
                  <dd>{rupees(unallocated)}</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium">
                <dt>Balance after</dt>
                <dd>{rupees(Math.max(0, totalDue - Math.min(amount, totalDue)))}</dd>
              </div>
              {totalDue > 0 && amount > 0 && (
                <div className="flex justify-between text-muted">
                  <dt>Clears</dt>
                  <dd>{pct((100 * Math.min(amount, totalDue)) / totalDue)} of the outstanding balance</dd>
                </div>
              )}
            </dl>
          </div>

          {over && <FormError message={`Allocated ${rupees(allocated)} is more than the amount received (${rupees(amount)}).`} />}
          {!paySession && <FormError message="No academic session covers this date." />}
          <div className="mt-3">
            <FormError message={state.error} />
          </div>
          <Button type="submit" variant="primary" className="mt-3 h-11 w-full text-base" disabled={pending || amount <= 0 || over || !paySession}>
            {pending ? "Saving…" : amount > 0 ? `Save & print receipt · ${rupees(amount)}` : "Save & print receipt"}
          </Button>
        </section>

        {recent.length > 0 && (
          <section className="rounded-xl border border-line bg-surface p-4 text-[13px]">
            <h3 className="mb-2 font-medium text-ink">Recent receipts</h3>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <Link href={`/payments/${r.id}`} className="text-accent hover:underline">
                    {r.receipt_no}
                  </Link>
                  <span className="tabular text-ink-2">
                    {fmtDate(r.paid_on)} · <span className={r.cancelled ? "line-through" : ""}>{rupees(r.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </form>
  );
}

function GroupRows({
  title,
  due,
  overdue,
  kind,
  pendingTotal,
  onFill,
  children,
}: {
  title: string;
  due: string;
  overdue: boolean;
  kind: "current" | "arrears" | "advance";
  pendingTotal: number;
  onFill: () => void;
  children: React.ReactNode;
}) {
  const dot = { current: "bg-series-1", arrears: "bg-series-2", advance: "bg-series-3" }[kind];
  return (
    <>
      <tr className="border-t border-line bg-surface-2/50">
        <td colSpan={3} className="px-4 py-2 sm:px-5">
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={cn("size-2.5 rounded-[3px]", dot)} aria-hidden />
            <span className="font-medium text-ink">{title}</span>
            <span className="text-[12px] text-muted">due {fmtDate(due)}</span>
            {kind === "arrears" && <Badge tone="serious">Previous dues</Badge>}
            {overdue ? <Badge tone="critical">Overdue</Badge> : <Badge>Upcoming</Badge>}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-semibold">{rupees(pendingTotal)}</td>
        <td className="px-4 py-2 text-right sm:px-5">
          <button type="button" onClick={onFill} className="text-[12.5px] font-medium text-accent hover:underline">
            Pay this
          </button>
        </td>
      </tr>
      {children}
    </>
  );
}
