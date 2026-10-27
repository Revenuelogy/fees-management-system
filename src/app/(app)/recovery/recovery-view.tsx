"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarRange, HandCoins, PhoneCall, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDateShort, monthLabel, num, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import type { RecoverySummary } from "@/lib/types";
import { type SearchParams, param } from "@/lib/context";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { BarList, StackedBar } from "@/components/ui/bars";
import { Button, LinkButton } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Empty } from "@/components/ui/empty";
import { RecoverySourceChart } from "@/components/charts/charts";
import { PERIODS, resolvePeriod, type Period } from "@/lib/period";

/**
 * Fee recovery: what came in over a period and what brought it in (a call, an activity, or the family on its own), and
 * which activities work. The call analytics (per day, callers, promises, whether calling helps) are on the Calls page.
 */
export function RecoveryView({ sp }: { sp: SearchParams }) {
  const { session, sessions } = useApp();
  const today = todayIST();
  const year = sessions.find((s) => s.start_date <= today && s.end_date >= today) ?? session;
  const period = resolvePeriod(param(sp.period), param(sp.from), param(sp.to), today, year?.start_date ?? null, "30d");
  const showCustom = param(sp.period) === "custom";
  const res = useApi<RecoverySummary>(withParams("/api/recovery", { from: period.from, to: period.to }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fee recovery"
        description="How much came in, and what brought it in: calls, activities, or families paying on their own."
        info="The accountant ticks, at the fee counter, whether a payment came because of a call or an activity. Those ticks decide the split below; everything else counts as paid on their own."
        actions={
          <>
            <LinkButton href="/activities">
              <Sparkles className="size-4" /> Activities
            </LinkButton>
            <LinkButton href={withParams("/calls", { view: "overview" })} variant="primary">
              <PhoneCall className="size-4" /> Calls
            </LinkButton>
          </>
        }
      >
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <Segmented
              options={PERIODS.map((p) => ({
                label: p.label,
                href: p.key === "custom" ? withParams("/recovery", { period: "custom", from: period.from, to: period.to }) : withParams("/recovery", { period: p.key }),
                active: showCustom ? p.key === "custom" : p.key === period.key,
              }))}
            />
          </div>
          {showCustom && <CustomRange period={period} today={today} />}
        </div>
      </PageHeader>

      {res.data ? <Dashboard d={res.data} period={period} /> : <Pending queries={[res]} />}
    </div>
  );
}

function CustomRange({ period, today }: { period: Period; today: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (from && to && from <= to) router.push(withParams("/recovery", { period: "custom", from, to }), { scroll: false });
      }}
    >
      <Input type="date" aria-label="From" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto" />
      <span className="text-footnote text-muted">to</span>
      <Input type="date" aria-label="To" value={to} max={today} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto" />
      <Button type="submit" size="sm" disabled={!from || !to || from > to}>
        Show
      </Button>
    </form>
  );
}

function bucketLabel(start: string, bucket: RecoverySummary["period"]["bucket"]) {
  if (bucket === "month") return monthLabel(start.slice(0, 7), false);
  return fmtDateShort(start);
}

function Dashboard({ d, period }: { d: RecoverySummary; period: Period }) {
  const m = d.money;
  const c = d.calls;
  const a = d.activities;
  const src = m.by_source;
  const change = m.prev_received > 0 ? ((m.received - m.prev_received) / m.prev_received) * 100 : null;
  const helped = src.calls.amount + src.activities.amount;
  const multiDay = d.period.days > 1;
  const trend = m.trend.map((t) => ({
    ...t,
    label: bucketLabel(t.start, d.period.bucket),
    tooltipLabel: d.period.bucket === "week" ? `Week of ${fmtDateShort(t.start)}` : bucketLabel(t.start, d.period.bucket),
  }));
  const topActivity = a.list.find((x) => x.recovered > 0);
  const callsHref = withParams("/calls", { view: "overview", period: period.key === "today" || period.key === "yesterday" || period.key === "7d" || period.key === "30d" ? period.key : undefined });

  return (
    <>
      {/* hero: the money of the period and what brought it in */}
      <section className="rounded-[28px] bg-surface p-6 shadow-card sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-subhead font-medium text-ink-2">
              <CalendarRange className="size-4" /> Received · {period.label}
            </p>
            <p className="figure mt-2 text-[44px] leading-none text-ink">{rupees(m.received)}</p>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-ink-2">
              <span>
                {num(m.receipts)} {m.receipts === 1 ? "receipt" : "receipts"} from {num(m.families)} {m.families === 1 ? "family" : "families"}
              </span>
              {change !== null && (
                <span className={cn("inline-flex items-center gap-1 font-medium", change >= 0 ? "text-good-ink" : "text-critical-ink")}>
                  {change >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                  {change >= 0 ? "+" : ""}
                  {pct(change, 0)} vs {period.before}
                </span>
              )}
            </p>
            <p className="mt-1.5 text-footnote text-ink-2">
              {m.received === 0 ? (
                <>No money came in {period.key === "today" ? "yet today" : "in this period"}.</>
              ) : helped > 0 ? (
                <>
                  <b className="font-semibold text-ink">{pct(ratioPct(helped, m.received), 0)}</b> of it came after a call or an activity.
                </>
              ) : (
                <>None of the receipts were marked as coming from a call or an activity.</>
              )}
              {(m.by_kind.arrears ?? 0) > 0 && (
                <>
                  {" "}
                  Includes <span className="font-medium text-serious-ink">{rupeesShort(m.by_kind.arrears ?? 0)}</span> old balance received.
                </>
              )}
            </p>
          </div>
          <div>
            <StackedBar
              height="h-3"
              total={m.received}
              segments={[
                { value: src.calls.amount, className: "bg-series-1", label: "After a call", display: rupeesShort(src.calls.amount) },
                { value: src.activities.amount, className: "bg-series-3", label: "From an activity", display: rupeesShort(src.activities.amount) },
                { value: src.direct.amount, className: "bg-series-track", label: "Paid on their own", display: rupeesShort(src.direct.amount) },
              ]}
            />
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              <SourceTile color="bg-series-1" label="After a call" amount={src.calls.amount} total={m.received} families={src.calls.families} href={callsHref} />
              <SourceTile color="bg-series-3" label="From an activity" amount={src.activities.amount} total={m.received} families={src.activities.families} href="#activities" />
              <SourceTile color="bg-series-track" label="Paid on their own" amount={src.direct.amount} total={m.received} families={src.direct.families} />
            </ul>
          </div>
        </div>
      </section>

      {multiDay && (
        <Card title="How the money came in" description="Each bar is a day (a week or a month for long periods), split by what brought the money in.">
          <RecoverySourceChart data={trend} />
        </Card>
      )}

      {/* the recovery work going on */}
      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={PhoneCall}
          color="blue"
          label="Calls made"
          value={num(c.calls)}
          sub={c.calls > 0 ? <>{pct(ratioPct(c.connected, c.calls), 0)} picked up · {c.promises} {c.promises === 1 ? "promise" : "promises"}</> : "No calls yet"}
          href={callsHref}
        />
        <Kpi
          icon={HandCoins}
          color="green"
          label="Came in after calls"
          value={rupeesShort(c.recovered)}
          sub={<>{c.families_paid} {c.families_paid === 1 ? "family" : "families"} paid after a call</>}
          href={callsHref}
        />
        <Kpi
          icon={Sparkles}
          color="teal"
          label="Activities running"
          value={num(a.running)}
          sub={<>{a.students} {a.students === 1 ? "student" : "students"} taking part{a.starting > 0 ? ` · ${a.starting} starting soon` : ""}</>}
          href="/activities"
        />
        <Kpi
          icon={HandCoins}
          color="teal"
          label="Came in from activities"
          value={rupeesShort(src.activities.amount)}
          sub={<>{src.activities.families} {src.activities.families === 1 ? "family" : "families"} paid because of one</>}
          href="#activities"
        />
      </div>

      <Card
        id="activities"
        title="Which activity brought the most"
        description="Receipts of the period counted for each activity at the fee counter."
        subtitle={topActivity ? `${topActivity.name}: ${rupeesShort(topActivity.recovered)} from ${topActivity.students_paid} ${topActivity.students_paid === 1 ? "student" : "students"}` : undefined}
        actions={
          <Link href="/activities" className="text-footnote font-medium text-accent">
            All activities
          </Link>
        }
      >
        {a.list.length === 0 ? (
          <Empty title="No activities in this period" icon={Sparkles} />
        ) : (
          <BarList
            color="bg-series-3"
            rows={a.list.map((x) => ({
              label: `${x.name}${x.status === "closed" ? " (closed)" : ""}`,
              value: x.recovered,
              display: rupeesShort(x.recovered),
              sub: `${x.students_paid} of ${x.participants} paid`,
              href: `/activities/${x.id}`,
            }))}
          />
        )}
      </Card>
    </>
  );
}

function SourceTile({ color, label, amount, total, families, href }: { color: string; label: string; amount: number; total: number; families: number; href?: string }) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-footnote text-ink-2">
        <span className={cn("size-2 rounded-full", color)} aria-hidden /> {label}
      </span>
      <span className="figure mt-1 block text-title3 text-ink">{rupeesShort(amount)}</span>
      <span className="text-caption text-muted">
        {pct(ratioPct(amount, total), 0)} · {families} {families === 1 ? "family" : "families"}
      </span>
    </>
  );
  return <li className="rounded-2xl bg-fill-2 px-3.5 py-3">{href ? <Link href={href}>{body}</Link> : body}</li>;
}
