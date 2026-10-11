"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { compactAxis, rupees } from "@/lib/format";

const AXIS = { stroke: "var(--chart-axis)", tickLine: false, axisLine: { stroke: "var(--chart-axis)" } } as const;

type SeriesKey = { key: string; label: string; color: string; shape: "rect" | "line" };

function ChartTooltip({
  active,
  payload,
  label,
  series,
  footer,
}: Partial<TooltipContentProps<number, string>> & { series: SeriesKey[]; footer?: (row: Record<string, unknown>) => string | null }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Record<string, unknown>;
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-medium text-ink">{String(row?.tooltipLabel ?? label)}</div>
      <ul className="space-y-0.5">
        {series.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-ink-2">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
            <span className="font-semibold tabular text-ink">{rupees(Number(row?.[s.key] ?? 0))}</span>
          </li>
        ))}
      </ul>
      {footer && footer(row) && <div className="mt-1 border-t border-line pt-1 text-muted">{footer(row)}</div>}
    </div>
  );
}

export function ChartLegend({ items }: { items: SeriesKey[] }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span
            className={s.shape === "line" ? "h-0.5 w-3.5 rounded" : "size-2.5 rounded-[3px]"}
            style={{ background: s.color }}
            aria-hidden
          />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Month-by-month collection across a session.
 * Monthly view: scheduled amount (neutral column) beside received (stacked by what it paid for).
 * Cumulative view: running totals of scheduled vs received, which shows whether collection is behind.
 */
export function CollectionTrendChart({
  data,
  includeArrears,
  hrefBase,
  height = 280,
}: {
  data: {
    month: string;
    label: string;
    expected: number;
    current: number;
    arrears: number;
    advance: number;
    cum_expected?: number;
    cum_current?: number;
    cum_received?: number;
    is_future?: boolean;
  }[];
  includeArrears: boolean;
  hrefBase?: string;
  height?: number;
}) {
  const router = useRouter();
  const [view, setView] = useState<"monthly" | "cumulative">("monthly");
  const hasCumulative = data.some((d) => d.cum_expected !== undefined);

  const monthly: SeriesKey[] = [
    { key: "expected", label: "Scheduled (installments due)", color: "var(--series-track)", shape: "rect" },
    { key: "current", label: "Current year fees", color: "var(--series-1)", shape: "rect" },
    ...(includeArrears
      ? ([
          { key: "arrears", label: "Previous dues", color: "var(--series-2)", shape: "rect" },
          { key: "advance", label: "Advance", color: "var(--series-3)", shape: "rect" },
        ] as SeriesKey[])
      : []),
  ];
  const cumulative: SeriesKey[] = [
    { key: "cum_expected", label: "Scheduled so far", color: "var(--ink-2)", shape: "line" },
    { key: "cum_current", label: "Current year fees received so far", color: "var(--series-1)", shape: "line" },
  ];
  const rows = data.map((d) => ({
    ...d,
    tooltipLabel: d.label,
    cum_current: d.is_future ? null : d.cum_current,
  }));
  const onClick = (e: unknown) => {
    const idx = (e as { activeTooltipIndex?: number | string } | null)?.activeTooltipIndex;
    if (hrefBase && idx !== undefined && idx !== null && rows[Number(idx)]) router.push(`${hrefBase}${rows[Number(idx)].month}`);
  };
  const series = view === "monthly" ? monthly : cumulative;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <ChartLegend items={series} />
        {hasCumulative && (
          <div className="no-print inline-flex rounded-lg border border-line bg-surface-2 p-0.5 text-[12.5px]" role="group" aria-label="Chart view">
            {(["monthly", "cumulative"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={view === v ? "rounded-md bg-surface px-2 py-0.5 font-medium text-ink shadow-sm" : "rounded-md px-2 py-0.5 text-ink-2 hover:text-ink"}
              >
                {v === "monthly" ? "Monthly" : "Cumulative"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {view === "monthly" ? (
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={onClick} barGap={2}
              style={{ cursor: hrefBase ? "pointer" : undefined }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...AXIS} tick={{ fontSize: 11 }} interval={0} minTickGap={4} />
              <YAxis {...AXIS} axisLine={false} width={44} tickFormatter={(v) => compactAxis(Number(v))} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: "var(--surface-2)" }}
                content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} series={monthly} footer={() => (hrefBase ? "Click to open the month" : null)} />}
              />
              <Bar dataKey="expected" fill="var(--series-track)" maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="current" stackId="r" fill="var(--series-1)" maxBarSize={20} stroke="var(--surface)" strokeWidth={1}
                radius={includeArrears ? 0 : [4, 4, 0, 0]} isAnimationActive={false} />
              {includeArrears && (
                <Bar dataKey="arrears" stackId="r" fill="var(--series-2)" maxBarSize={20} stroke="var(--surface)" strokeWidth={1} isAnimationActive={false} />
              )}
              {includeArrears && (
                <Bar dataKey="advance" stackId="r" fill="var(--series-3)" maxBarSize={20} stroke="var(--surface)" strokeWidth={1}
                  radius={[4, 4, 0, 0]} isAnimationActive={false} />
              )}
            </ComposedChart>
          ) : (
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} onClick={onClick}
              style={{ cursor: hrefBase ? "pointer" : undefined }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...AXIS} tick={{ fontSize: 11 }} interval={0} minTickGap={4} />
              <YAxis {...AXIS} axisLine={false} width={44} tickFormatter={(v) => compactAxis(Number(v))} tick={{ fontSize: 11 }} />
              <Tooltip
                cursor={{ stroke: "var(--line-strong)" }}
                content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} series={cumulative} />}
              />
              <Line type="stepAfter" dataKey="cum_expected" stroke="var(--ink-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="linear" dataKey="cum_current" stroke="var(--series-1)" strokeWidth={2}
                dot={{ r: 3, fill: "var(--series-1)", stroke: "var(--surface)", strokeWidth: 2 }} activeDot={{ r: 5 }}
                connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Money received per day in a month. */
export function DailyCollectionChart({
  data,
  height = 220,
}: {
  data: { date: string; day: number; amount: number; count: number; is_future: boolean }[];
  height?: number;
}) {
  const series: SeriesKey[] = [{ key: "amount", label: "Received", color: "var(--series-1)", shape: "rect" }];
  const rows = data.map((d) => ({ ...d, tooltipLabel: `${d.day} · ${d.count} payment${d.count === 1 ? "" : "s"}` }));
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" {...AXIS} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...AXIS} axisLine={false} width={44} tickFormatter={(v) => compactAxis(Number(v))} tick={{ fontSize: 11 }} />
          <Tooltip cursor={{ fill: "var(--surface-2)" }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} series={series} />} />
          <Bar dataKey="amount" fill="var(--series-1)" maxBarSize={18} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cumulative money in the month against the month's target. */
export function CumulativeChart({
  data,
  target,
  height = 220,
}: {
  data: { date: string; day: number; cumulative: number; is_future: boolean }[];
  target: number;
  height?: number;
}) {
  const series: SeriesKey[] = [{ key: "cumulative", label: "Received so far", color: "var(--series-1)", shape: "line" }];
  const rows = data.map((d) => ({ ...d, cumulative: d.is_future ? null : d.cumulative, tooltipLabel: `Day ${d.day}` }));
  const max = Math.max(target, ...data.map((d) => d.cumulative)) * 1.08;
  return (
    <div>
      <ChartLegend items={[...series, { key: "target", label: "Expected this month", color: "var(--ink-2)", shape: "line" }]} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="day" {...AXIS} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis {...AXIS} axisLine={false} width={44} domain={[0, max || 1]} tickFormatter={(v) => compactAxis(Number(v))} tick={{ fontSize: 11 }} />
            <Tooltip cursor={{ stroke: "var(--line-strong)" }} content={(p) => <ChartTooltip {...(p as TooltipContentProps<number, string>)} series={series} />} />
            {target > 0 && <ReferenceLine y={target} stroke="var(--ink-2)" strokeWidth={1.5} />}
            <Line type="monotone" dataKey="cumulative" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
