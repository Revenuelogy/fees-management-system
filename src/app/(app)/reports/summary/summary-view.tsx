"use client";

import { flag, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, pct, ratioPct, rupeesShort, todayIST } from "@/lib/format";
import type { Dashboard, MonthSummary, StudentBalance } from "@/lib/types";
import { Segmented } from "@/components/ui/segmented";
import { PrintButton } from "@/components/ui/print-button";
import { NoSession } from "@/components/no-session";
import { Ring } from "@/components/ui/ring";
import { Legend, Meter } from "@/components/ui/bars";
import { InfoTip } from "@/components/ui/info-tip";
import { ShareSummary } from "./share-summary";

export function SummaryView({ sp }: { sp: SearchParams }) {
  const { session, settings } = useApp();
  const arrears = flag(sp.arrears, true);
  const today = todayIST();
  const month = !session || (today >= session.start_date && today <= session.end_date) ? today.slice(0, 7) : session.end_date.slice(0, 7);

  const dashRes = useApi<Dashboard>(session ? apiUrl("/api/analytics/dashboard", { session: session.id, arrears }) : null);
  const defRes = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/defaulters", { session: session.id, arrears, limit: 10 }) : null);
  const monthRes = useApi<MonthSummary>(session ? apiUrl(`/api/analytics/months/${month}`, { carry: true, arrears }) : null);
  if (!session) return <NoSession />;
  // the month block is optional: a month outside every session just leaves it out
  if (!dashRes.data || !defRes.data || (!monthRes.data && !monthRes.error)) return <Pending queries={[dashRes, defRes]} />;
  const d = dashRes.data;
  const k = d.kpis;
  const top = defRes.data;
  const m = monthRes.data ?? null;

  const expected = k.session_expected + (arrears ? k.prev_opening : 0);
  const received = k.session_received + (arrears ? k.prev_recovered : 0);
  const pending = k.session_pending + (arrears ? k.prev_pending : 0);
  const overdue = k.session_overdue + (arrears ? k.prev_pending : 0);
  const classes = [...d.classes].sort((a, b) => b.pending - a.pending);
  const months = d.trend.filter((t) => !t.is_future);
  const maxMonth = Math.max(1, ...months.map((t) => Math.max(t.expected, t.current + (arrears ? t.arrears : 0))));
  const collected = ratioPct(received, expected) ?? 0;

  const text = [
    `*${settings?.school_name ?? "School"} — fee summary ${d.session.name}* (as of ${fmtDate(today)})`,
    `Expected: ${rupeesShort(expected)} | Received: ${rupeesShort(received)} (${pct(ratioPct(received, expected))})`,
    `Pending: ${rupeesShort(pending)} | Overdue: ${rupeesShort(overdue)}`,
    `Previous dues recovered: ${rupeesShort(k.prev_recovered)} of ${rupeesShort(k.prev_opening)}`,
    m ? `${m.label}: ${rupeesShort(m.summary.received)} received, ${rupeesShort(m.summary.still_to_come)} still to come` : "",
    `Top pending classes: ${classes.slice(0, 3).map((c) => `${c.class_name} ${rupeesShort(c.pending)}`).join(", ")}`,
    `Top defaulters: ${top.slice(0, 5).map((s) => `${s.full_name} (${s.class_name ?? "-"}) ${rupeesShort(arrears ? s.total_overdue : s.overdue)}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={[
            { label: "Including previous dues", href: "/reports/summary", active: arrears },
            { label: "Current session only", href: "/reports/summary?arrears=0", active: !arrears },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ShareSummary text={text} />
          <PrintButton label="Print / save as PDF" variant="primary" />
        </div>
      </div>

      <article className="rounded-[28px] bg-surface p-6 shadow-card [print-color-adjust:exact] sm:p-9 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-title2 font-bold text-ink">{settings?.school_name}</p>
            <p className="mt-0.5 text-subhead text-ink-2">Fee summary · {d.session.name}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-subhead font-medium text-ink">{fmtDate(today)}</p>
            <p className="text-caption text-muted">{arrears ? "Including previous dues" : "Current session only"}</p>
          </div>
        </header>

        <section className="mt-7 grid grid-cols-1 items-center gap-7 sm:grid-cols-[auto_1fr]">
          <Ring value={collected} size={148} stroke={15} label={`${pct(collected, 0)} collected`} className="justify-self-center">
            <span className="figure text-[30px] leading-none text-ink">{Math.round(collected)}%</span>
            <span className="mt-1 text-caption text-ink-2">collected</span>
          </Ring>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <Figure label="Received" value={rupeesShort(received)} sub={`of ${rupeesShort(expected)}`} dot="bg-series-1" />
            <Figure label="Pending" value={rupeesShort(pending)} sub={`${k.students_billed} students billed`} dot="bg-series-track" />
            <Figure label="Overdue" value={rupeesShort(overdue)} sub="already past due" dot="bg-critical" />
            <Figure label="Old dues recovered" value={rupeesShort(k.prev_recovered)} sub={`of ${rupeesShort(k.prev_opening)}`} dot="bg-series-2" />
          </div>
        </section>

        {m && (
          <section className="mt-7 rounded-2xl bg-fill-2 px-5 py-4">
            <p className="text-footnote font-semibold text-ink">{m.label}</p>
            <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Mini label="Received" value={rupeesShort(m.summary.received)} />
              <Mini label="Old dues in it" value={rupeesShort(m.summary.received_arrears)} />
              <Mini label="Still to come" value={rupeesShort(m.summary.still_to_come)} />
              <Mini label="Students paid" value={`${m.summary.students_paid} of ${m.summary.students_paid + m.summary.students_expected_not_paid}`} />
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="mb-3 flex items-center gap-1.5 text-headline font-semibold text-ink">
              Pending by class
              <InfoTip>Amount = still pending. Bar = share of the class&apos;s fees collected.</InfoTip>
            </h2>
            <ul className="space-y-2.5">
              {classes.map((c) => (
                <li key={c.class_id ?? "none"}>
                  <div className="flex items-baseline justify-between gap-3 text-subhead">
                    <span className="truncate text-ink">{c.class_name}</span>
                    <span className="shrink-0 tabular">
                      <span className="font-semibold text-ink">{rupeesShort(c.pending)}</span>
                      <span className="ml-2 inline-block w-14 text-right text-caption text-muted">{pct(c.collection_pct, 0)} paid</span>
                    </span>
                  </div>
                  <Meter value={c.collection_pct} className="mt-1.5" />
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-headline font-semibold text-ink">Top 10 overdue</h2>
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
                  <span className="shrink-0 text-subhead font-semibold tabular text-critical-ink">{rupeesShort(arrears ? s.total_overdue : s.overdue)}</span>
                </li>
              ))}
              {top.length === 0 && <li className="py-2 text-subhead text-muted">Nobody is overdue.</li>}
            </ol>
          </section>
        </div>

        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-headline font-semibold text-ink">Month by month</h2>
            <Legend
              items={[
                { label: "This year", className: "bg-series-1" },
                ...(arrears ? [{ label: "Old dues", className: "bg-series-2" }] : []),
                { label: "Fell due", className: "bg-series-track" },
              ]}
            />
          </div>
          <ul className="space-y-2">
            {months.map((t) => (
              <li key={t.month} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3 text-subhead">
                <span className="text-ink-2">{t.label.split(" ")[0].slice(0, 3)}</span>
                <span className="space-y-1">
                  <span className="flex h-2.5 overflow-hidden rounded-full bg-fill" style={{ width: `${Math.max(2, ratioPct(Math.max(t.current + (arrears ? t.arrears : 0), 1), maxMonth) ?? 0)}%` }}>
                    <span className="h-full bg-series-1" style={{ flexGrow: t.current }} />
                    {arrears && <span className="h-full bg-series-2" style={{ flexGrow: t.arrears }} />}
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

function Figure({ label, value, sub, dot }: { label: string; value: string; sub: string; dot: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-footnote text-ink-2">
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
