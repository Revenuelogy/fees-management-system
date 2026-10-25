"use client";

import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, pct, ratioPct, rupeesShort, todayIST } from "@/lib/format";
import type { Dashboard, HomeFees, MonthSummary, StudentBalance } from "@/lib/types";
import { MONEY } from "@/lib/glossary";
import { PrintButton } from "@/components/ui/print-button";
import { NoSession } from "@/components/no-session";
import { Ring } from "@/components/ui/ring";
import { Legend, Meter } from "@/components/ui/bars";
import { InfoTip } from "@/components/ui/info-tip";
import { ShareSummary } from "./share-summary";

export function SummaryView() {
  const { session, settings } = useApp();
  const today = todayIST();
  const month = !session || (today >= session.start_date && today <= session.end_date) ? today.slice(0, 7) : session.end_date.slice(0, 7);

  // the money figures are Home's (the same numbers on both); the old balance is its own line, never added into them
  const feesRes = useApi<HomeFees>(session ? apiUrl("/api/home/fees", { session: session.id }) : null);
  const dashRes = useApi<Dashboard>(session ? apiUrl("/api/analytics/dashboard", { session: session.id }) : null);
  const defRes = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/defaulters", { session: session.id, limit: 10 }) : null);
  const monthRes = useApi<MonthSummary>(session ? apiUrl(`/api/analytics/months/${month}`, { carry: true }) : null);
  if (!session) return <NoSession />;
  // the month block is optional: a month outside every session just leaves it out
  if (!feesRes.data || !dashRes.data || !defRes.data || (!monthRes.data && !monthRes.error)) return <Pending queries={[feesRes, dashRes, defRes]} />;
  const f = feesRes.data;
  const d = dashRes.data;
  const top = defRes.data;
  const m = monthRes.data ?? null;

  const { total_fee: total, received, balance, due_now: dueNow, due_later: dueLater, old_balance: old, to_recover: toRecover } = f;
  const classes = [...d.classes].sort((a, b) => b.pending - a.pending);
  const months = d.trend.filter((t) => !t.is_future);
  const maxMonth = Math.max(1, ...months.map((t) => Math.max(t.expected, t.current + t.arrears)));
  const share = ratioPct(received, total) ?? 0;

  const text = [
    `*${settings?.school_name ?? "School"} — fee summary ${d.session.name}* (as of ${fmtDate(today)})`,
    `${MONEY.total_fee.label}: ${rupeesShort(total)} | ${MONEY.received.label}: ${rupeesShort(received)} (${pct(share)})`,
    `${MONEY.balance.label}: ${rupeesShort(balance)} = ${MONEY.due_now.label} ${rupeesShort(dueNow)} + ${MONEY.due_later.label} ${rupeesShort(dueLater)}`,
    `${MONEY.old_balance.label}: ${rupeesShort(old)} left | ${MONEY.old_balance_received.label}: ${rupeesShort(f.old_balance_received)}`,
    `${MONEY.to_recover.label}: ${rupeesShort(toRecover)} (${MONEY.due_now.label} + ${MONEY.old_balance.label})`,
    m ? `${m.label}: ${rupeesShort(m.summary.received)} received, ${rupeesShort(m.summary.still_to_come)} due now` : "",
    `Largest balance by class: ${classes.slice(0, 3).map((c) => `${c.class_name} ${rupeesShort(c.pending)}`).join(", ")}`,
    `Top by due now: ${top.slice(0, 5).map((s) => `${s.full_name} (${s.class_name ?? "-"}) ${rupeesShort(s.overdue)}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-end gap-2">
        <ShareSummary text={text} />
        <PrintButton label="Print / save as PDF" variant="primary" />
      </div>

      <article className="rounded-[28px] bg-surface p-6 shadow-card [print-color-adjust:exact] sm:p-9 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-title2 font-bold text-ink">{settings?.school_name}</p>
            <p className="mt-0.5 text-subhead text-ink-2">Fee summary · {d.session.name}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-subhead font-medium text-ink">{fmtDate(today)}</p>
            <p className="text-caption text-muted">This year&apos;s fees, with old balance on its own line</p>
          </div>
        </header>

        <section className="mt-7 grid grid-cols-1 items-center gap-7 sm:grid-cols-[auto_1fr]">
          <Ring value={share} size={148} stroke={15} label={`${pct(share, 0)} of total fee received`} className="justify-self-center">
            <span className="figure text-[30px] leading-none text-ink">{Math.round(share)}%</span>
            <span className="mt-1 text-caption text-ink-2">received</span>
          </Ring>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Figure label={MONEY.received.label} hint={MONEY.received.hint} value={rupeesShort(received)} sub={`of ${rupeesShort(total)} total fee`} dot="bg-series-1" />
            <Figure label={MONEY.balance.label} hint={MONEY.balance.hint} value={rupeesShort(balance)} sub={`${rupeesShort(dueLater)} due later`} dot="bg-series-track" />
            <Figure label={MONEY.due_now.label} hint={MONEY.due_now.hint} value={rupeesShort(dueNow)} sub="due date has passed" dot="bg-critical" />
            <Figure label={MONEY.old_balance.label} hint={MONEY.old_balance.hint} value={rupeesShort(old)} sub={`${rupeesShort(f.old_balance_received)} received`} dot="bg-series-2" />
          </div>
        </section>

        <section className="mt-6 flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-critical-soft px-5 py-4 print:border print:border-line print:bg-transparent">
          <p className="flex items-center gap-1.5 text-subhead font-semibold text-critical-ink">
            {MONEY.to_recover.label}
            <InfoTip>{MONEY.to_recover.hint}.</InfoTip>
          </p>
          <p className="text-subhead text-ink-2">
            <span className="figure text-title2 text-critical-ink">{rupeesShort(toRecover)}</span>
            <span className="ml-2 tabular">
              {rupeesShort(dueNow)} this year + {rupeesShort(old)} old balance
            </span>
          </p>
        </section>

        {m && (
          <section className="mt-7 rounded-2xl bg-fill-2 px-5 py-4">
            <p className="text-footnote font-semibold text-ink">{m.label}</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Received this month" value={rupeesShort(m.summary.received)} />
              <Mini label={MONEY.old_balance_received.label} value={rupeesShort(m.summary.received_arrears)} />
              <Mini label={MONEY.due_now.label} value={rupeesShort(m.summary.still_to_come)} />
              <Mini label="Students paid" value={`${m.summary.students_paid} of ${m.summary.students_paid + m.summary.students_expected_not_paid}`} />
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-headline font-semibold text-ink">
              Balance by class
              <InfoTip>Amount = this year&apos;s balance. Bar = share of the class&apos;s total fee received.</InfoTip>
            </h2>
            <ul className="space-y-2.5">
              {classes.map((c) => (
                <li key={c.class_id ?? "none"}>
                  <div className="flex items-baseline justify-between gap-3 text-subhead">
                    <span className="truncate text-ink">{c.class_name}</span>
                    <span className="shrink-0 tabular">
                      <span className="font-semibold text-ink">{rupeesShort(c.pending)}</span>
                      <span className="ml-2 inline-block w-20 text-right text-caption text-muted">{pct(c.collection_pct, 0)} received</span>
                    </span>
                  </div>
                  <Meter value={c.collection_pct} className="mt-1.5" />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-headline font-semibold text-ink">Top 10 by due now</h2>
            <ol className="divide-y divide-line">
              {top.map((s, i) => (
                <li key={s.student_id} className="flex items-center gap-3 py-2">
                  <span className="w-5 shrink-0 text-caption font-medium tabular text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead font-medium text-ink">{s.full_name}</span>
                    <span className="block truncate text-caption text-muted">
                      {[s.class_name ?? "No class", s.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-subhead font-semibold tabular text-critical-ink">{rupeesShort(s.overdue)}</span>
                    {s.prev_pending > 0 && <span className="block text-caption tabular text-serious-ink">+ {rupeesShort(s.prev_pending)} old balance</span>}
                  </span>
                </li>
              ))}
              {top.length === 0 && <li className="py-2 text-subhead text-muted">Nothing is due now.</li>}
            </ol>
          </section>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-headline font-semibold text-ink">Month by month</h2>
            <Legend
              items={[
                { label: "This year", className: "bg-series-1" },
                { label: MONEY.old_balance.label, className: "bg-series-2" },
                { label: "Installments due", className: "bg-series-track" },
              ]}
            />
          </div>
          <ul className="space-y-2">
            {months.map((t) => (
              <li key={t.month} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 text-subhead">
                <span className="text-ink-2">{t.label.split(" ")[0].slice(0, 3)}</span>
                <span className="space-y-1">
                  <span className="flex h-2.5 overflow-hidden rounded-full bg-fill" style={{ width: `${Math.max(2, ratioPct(Math.max(t.current + t.arrears, 1), maxMonth) ?? 0)}%` }}>
                    <span className="h-full bg-series-1" style={{ flexGrow: t.current }} />
                    <span className="h-full bg-series-2" style={{ flexGrow: t.arrears }} />
                  </span>
                  {t.expected > 0 && <span className="block h-1 rounded-full bg-series-track" style={{ width: `${ratioPct(t.expected, maxMonth) ?? 0}%` }} />}
                </span>
                <span className="w-20 text-right font-semibold tabular text-ink">{rupeesShort(t.received)}</span>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </div>
  );
}

function Figure({ label, hint, value, sub, dot }: { label: string; hint: string; value: string; sub: string; dot: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-footnote text-ink-2" title={hint}>
        <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
        {label}
      </p>
      <p className="figure mt-1 text-title2 text-ink">{value}</p>
      <p className="mt-0.5 truncate text-caption text-muted">{sub}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-caption text-ink-2">{label}</p>
      <p className="mt-0.5 text-headline font-semibold tabular text-ink">{value}</p>
    </div>
  );
}
