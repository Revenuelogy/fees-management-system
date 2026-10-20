"use client";

import Link from "next/link";
import { AlertTriangle, CalendarDays, ChevronRight, FileText, History } from "lucide-react";
import { flag, param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { MODE_LABELS, fmtDate, monthLabel, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import type { Dashboard, FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { BarList, StackedBar } from "@/components/ui/bars";
import { LinkButton } from "@/components/ui/button";
import { Donut, Ring } from "@/components/ui/ring";
import { Avatar } from "@/components/ui/avatar";
import { FEE_STATUS } from "@/components/ui/status";
import { CollectionTrendChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";

const STATUS_ORDER: FeeStatus[] = ["paid_up", "partial", "arrears_only", "not_paying", "free"];
const STATUS_COLOR: Record<FeeStatus, string> = {
  paid_up: "var(--good)",
  partial: "var(--warning)",
  arrears_only: "var(--serious)",
  not_paying: "var(--critical)",
  free: "var(--tile-gray)",
  no_plan: "var(--surface-3)",
};

export function DashboardView({ sp }: { sp: SearchParams }) {
  const { session } = useApp();
  const arrears = flag(sp.arrears, false);
  const top = Math.min(Math.max(Number(param(sp.top) ?? 8) || 8, 5), 50);

  const dash = useApi<Dashboard>(session ? apiUrl("/api/analytics/dashboard", { session: session.id, arrears }) : null);
  const defaultersRes = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/defaulters", { session: session.id, arrears, limit: top }) : null);
  if (!session) return <NoSession />;
  if (!dash.data || !defaultersRes.data) return <Pending queries={[dash, defaultersRes]} />;
  const d = dash.data;
  const k = d.kpis;
  const defaulters = defaultersRes.data;

  const expected = k.session_expected + (arrears ? k.prev_opening : 0);
  const received = k.session_received + (arrears ? k.prev_recovered : 0);
  const pending = k.session_pending + (arrears ? k.prev_pending : 0);
  const overdue = k.session_overdue + (arrears ? k.prev_pending : 0);
  const notDue = Math.max(0, pending - overdue);
  const collectedPct = ratioPct(received, expected) ?? 0;

  const thisMonthKey = todayIST().slice(0, 7);
  const thisMonth = d.trend.find((t) => t.month === thisMonthKey);
  const statusTotal = STATUS_ORDER.reduce((s, x) => s + (d.status[x] ?? 0), 0);
  const classes = [...d.classes].filter((c) => c.expected > 0 || c.pending > 0).sort((a, b) => b.pending - a.pending);
  const modesTotal = d.modes.reduce((s, m) => s + m.amount, 0);
  const q = (extra: Record<string, string | number | boolean | undefined>) => withParams("/", { arrears: arrears || undefined, ...extra });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        description={`Session ${d.session.name} · as of ${fmtDate(d.today)}`}
        actions={
          <LinkButton href={withParams("/reports/summary", { arrears: arrears ? undefined : 0 })}>
            <FileText className="size-4" /> Report
          </LinkButton>
        }
      >
        <Segmented
          options={[
            { label: "This session", href: q({ arrears: undefined }), active: !arrears },
            { label: "Including old dues", href: q({ arrears: true }), active: arrears },
          ]}
        />
      </PageHeader>

      {/* Hero: where is the money */}
      <section className="animate-rise rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-subhead font-medium text-ink-2">Collected</p>
            <p className="figure mt-1 text-[44px] leading-none text-ink sm:text-display">{rupeesShort(received)}</p>
            <p className="mt-2 text-body text-ink-2">
              of <span className="font-semibold text-ink">{rupeesShort(expected)}</span> expected
              {arrears && k.prev_opening > 0 && <span className="text-muted"> · incl. {rupeesShort(k.prev_opening)} old dues</span>}
            </p>
            <div className="mt-6 max-w-2xl">
              <StackedBar
                height="h-3"
                total={expected}
                segments={[
                  { value: received, className: "bg-series-1", label: "Collected", display: rupees(received) },
                  { value: overdue, className: "bg-critical", label: "Overdue", display: rupees(overdue) },
                  { value: notDue, className: "bg-series-track", label: "Not due yet", display: rupees(notDue) },
                ]}
              />
              <div className="mt-3 grid grid-cols-3 gap-3">
                {[
                  { label: "Collected", value: received, dot: "bg-series-1", href: "/payments?preset=session" },
                  { label: "Overdue", value: overdue, dot: "bg-critical", href: withParams("/pending", { arrears: arrears || undefined, due: 1 }) },
                  { label: "Not due yet", value: notDue, dot: "bg-series-track", href: withParams("/pending", { arrears: arrears || undefined }) },
                ].map((x) => (
                  <Link key={x.label} href={x.href} className="group rounded-xl py-1">
                    <span className="flex items-center gap-1.5 text-footnote text-ink-2">
                      <span className={`size-2 rounded-full ${x.dot}`} aria-hidden />
                      {x.label}
                    </span>
                    <span className="mt-0.5 block text-title3 font-semibold tabular text-ink group-hover:text-accent">{rupeesShort(x.value)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Ring value={collectedPct} size={188} stroke={18} label={`${pct(collectedPct, 0)} collected`} className="self-center">
            <span className="figure text-[38px] leading-none text-ink">{Math.round(collectedPct)}%</span>
            <span className="mt-1 text-footnote text-ink-2">collected</span>
          </Ring>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi
          icon={AlertTriangle}
          color="red"
          label="Students behind"
          value={k.students_with_overdue}
          href={withParams("/pending", { arrears: arrears || undefined, due: 1 })}
          sub={<>{pct(ratioPct(k.session_due_expected - k.session_overdue, k.session_due_expected), 0)} of dues so far collected</>}
        />
        <Kpi
          icon={CalendarDays}
          color="blue"
          label={thisMonth ? monthLabel(thisMonth.month) : "This month"}
          value={rupeesShort(thisMonth ? thisMonth.received : 0)}
          href="/monthly"
          sub={thisMonth && thisMonth.expected > 0 ? <>{rupeesShort(thisMonth.expected)} falls due this month</> : "No installment due this month"}
        />
        <Kpi
          icon={History}
          color="orange"
          label="Old dues recovered"
          value={rupeesShort(k.prev_recovered)}
          meter={ratioPct(k.prev_recovered, k.prev_opening)}
          href={withParams("/pending", { arrears: 1, prev: 1 })}
          sub={k.prev_opening > 0 ? <>{rupeesShort(k.prev_pending)} still owed by {k.students_with_prev_dues} students</> : "No old dues"}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Collection by month" description="Bars: money that came in each month (what it paid for) next to installments that fell due. Click a month to open it.">
          <CollectionTrendChart data={d.trend} includeArrears={arrears} hrefBase="/monthly?month=" />
        </Card>
        <Card title="Students" description="Fee status of every student, recalculated live.">
          <div className="flex flex-col items-center gap-5 sm:flex-row xl:flex-col">
            <Donut
              size={156}
              stroke={20}
              segments={STATUS_ORDER.map((s) => ({ value: d.status[s] ?? 0, color: STATUS_COLOR[s], label: FEE_STATUS[s].label }))}
            >
              <span className="figure text-title1 text-ink">{statusTotal}</span>
              <span className="text-caption text-ink-2">students</span>
            </Donut>
            <ul className="w-full space-y-1">
              {STATUS_ORDER.filter((s) => (d.status[s] ?? 0) > 0).map((s) => (
                <li key={s}>
                  <Link
                    href={withParams("/pending", { arrears: arrears || undefined, status: s })}
                    className="flex items-center justify-between rounded-xl px-2 py-1.5 text-subhead transition-colors hover:bg-fill-2"
                  >
                    <span className="flex items-center gap-2.5 text-ink">
                      <span className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                      {FEE_STATUS[s].label}
                    </span>
                    <span className="tabular">
                      <span className="font-semibold text-ink">{d.status[s]}</span>
                      <span className="ml-1.5 text-footnote text-muted">{pct(ratioPct(d.status[s] ?? 0, statusTotal), 0)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Classes"
          description="Bar = share of the class's fees collected. Amount = still pending. Sorted by pending."
          actions={
            <Link href={withParams("/classes", { arrears: arrears || undefined })} className="text-footnote font-medium text-accent">
              All classes
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {classes.slice(0, 8).map((c) => (
              <li key={c.class_id ?? "none"}>
                <Link
                  href={c.class_id ? withParams(`/classes/${c.class_id}`, { arrears: arrears || undefined }) : withParams("/pending", { arrears: 1, unassigned: 1 })}
                  className="group grid grid-cols-[minmax(84px,120px)_1fr_auto] items-center gap-4 py-2.5"
                >
                  <span className="truncate text-subhead font-medium text-ink group-hover:text-accent">{c.class_name}</span>
                  <span className="flex items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill-2">
                      <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.min(100, c.collection_pct ?? 0)}%` }} />
                    </span>
                    <span className="w-11 text-right text-footnote tabular text-ink-2">{pct(c.collection_pct, 0)}</span>
                  </span>
                  <span className="w-24 text-right">
                    <span className="block text-subhead font-semibold tabular text-ink">{rupeesShort(c.pending)}</span>
                    <span className="block text-caption tabular text-muted">{pct(c.share_of_pending, 0)} of pending</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          className="xl:col-span-2"
          title="Not paying"
          description={arrears ? "Highest overdue amounts, including old dues." : "Highest overdue amounts this session."}
          actions={
            <Link href={withParams("/pending", { arrears: arrears || undefined, due: 1 })} className="text-footnote font-medium text-accent">
              See all
            </Link>
          }
        >
          {defaulters.length === 0 ? (
            <p className="py-8 text-center text-subhead text-ink-2">Everyone is up to date.</p>
          ) : (
            <ul className="-mx-2">
              {defaulters.map((s) => (
                <li key={s.student_id}>
                  <Link href={`/students/${s.student_id}`} className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-fill-2">
                    <Avatar name={s.full_name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-subhead font-medium text-ink">{s.full_name}</span>
                      <span className="block truncate text-caption text-muted">
                        {s.class_name ?? "Left"}
                        {s.days_since_payment !== null ? ` · ${s.days_since_payment} days silent` : " · never paid"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-subhead font-semibold tabular text-critical-ink">{rupeesShort(arrears ? s.total_overdue : s.overdue)}</span>
                      {s.prev_pending > 0 && <span className="block text-caption tabular text-serious-ink">{rupeesShort(s.prev_pending)} old</span>}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card title="Where money came from" subtitle={`${d.modes.reduce((a, m) => a + m.count, 0)} receipts this session`} description="Money received in this session by payment mode.">
          <BarList
            compact
            rows={d.modes.map((m) => ({
              label: MODE_LABELS[m.mode] ?? m.mode,
              value: m.amount,
              display: rupeesShort(m.amount),
              sub: pct(ratioPct(m.amount, modesTotal), 0),
            }))}
          />
        </Card>
        <Card title="Pending by fee head" description="What kind of fee is still unpaid.">
          <BarList
            compact
            color="bg-tile-indigo"
            rows={d.heads
              .filter((h) => h.expected > 0)
              .map((h) => ({
                label: h.fee_head,
                value: h.pending,
                display: rupeesShort(h.pending),
                sub: `${pct(ratioPct(h.received, h.expected), 0)} paid`,
              }))}
          />
        </Card>
      </div>
    </div>
  );
}
