"use client";

import Link from "next/link";
import { CalendarDays, HandCoins, MessageSquareText, PhoneCall, Trophy, TrendingDown, TrendingUp, UserPlus, UsersRound } from "lucide-react";
import { cn } from "@/lib/cn";
import { fmtDateShort, monthLabel, num, pct, ratioPct, rupeesShort } from "@/lib/format";
import type { Period } from "@/lib/period";
import { OUTCOMES, OUTCOME_LABELS, PURPOSES, PURPOSE_LABELS, RESPONSES, RESPONSE_LABELS } from "@/lib/recovery";
import { ROLE_LABELS } from "@/lib/roles";
import { plural } from "@/lib/text";
import type { CallAnalytics, CallerFigures } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { BarList, Legend, Meter, StackedBar } from "@/components/ui/bars";
import { Empty } from "@/components/ui/empty";
import { withParams } from "@/components/ui/segmented";
import { CallsTrendChart } from "@/components/charts/charts";

function bucketLabel(start: string, bucket: CallAnalytics["period"]["bucket"]) {
  return bucket === "month" ? monthLabel(start.slice(0, 7), false) : fmtDateShort(start);
}

/** How calling went in the period: calls, picked up, promises and what came of them, and whether calling helps. */
export function CallsOverview({ d, period }: { d: CallAnalytics; period: Period }) {
  const c = d.calls;
  const decided = c.kept + c.partial + c.broken;
  const change = c.prev_calls > 0 ? ((c.calls - c.prev_calls) / c.prev_calls) * 100 : null;
  const trend = c.trend.map((t) => ({
    label: bucketLabel(t.start, d.period.bucket),
    tooltipLabel: d.period.bucket === "week" ? `Week of ${fmtDateShort(t.start)}` : bucketLabel(t.start, d.period.bucket),
    connected: t.connected,
    not_reached: t.calls - t.connected,
  }));
  const top = c.by_caller.filter((x) => x.calls > 0).slice(0, 3);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-5">
        <Kpi
          icon={PhoneCall}
          color="blue"
          label="Calls made"
          value={num(c.calls)}
          sub={
            <>
              {c.per_day} a day · {plural(c.callers, "caller")}
              {change !== null && (
                <span className={cn("ml-1.5 inline-flex items-center gap-0.5 font-medium", change >= 0 ? "text-good-ink" : "text-critical-ink")}>
                  {change >= 0 ? <TrendingUp className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                  {change >= 0 ? "+" : ""}
                  {pct(change, 0)}
                </span>
              )}
            </>
          }
          hint={`Every call in the period, about fees or anything else. The change is against ${period.before}.`}
        />
        <Kpi
          icon={UsersRound}
          color="indigo"
          label="Picked up"
          value={pct(ratioPct(c.connected, c.calls), 0)}
          meter={ratioPct(c.connected, c.calls)}
          sub={<>{num(c.connected)} picked up · {num(c.not_reached)} not reached</>}
        />
        <Kpi
          icon={MessageSquareText}
          color="teal"
          label="Promised to pay"
          value={num(c.promises)}
          sub={<>{rupeesShort(c.promised_amount)} promised · {rupeesShort(c.promise_paid)} paid against it</>}
        />
        <Kpi
          icon={CalendarDays}
          color="green"
          label="Promises kept"
          value={decided > 0 ? pct(ratioPct(c.kept, decided), 0) : "—"}
          meter={decided > 0 ? ratioPct(c.kept, decided) : undefined}
          sub={decided > 0 ? <>{c.kept} of {decided} whose date has passed{c.pending > 0 ? ` · ${c.pending} waiting` : ""}</> : c.pending > 0 ? `${c.pending} waiting for their date` : "None due yet"}
        />
        <Kpi
          icon={HandCoins}
          color="green"
          label="Came in after calls"
          value={rupeesShort(c.recovered)}
          tone={c.recovered > 0 ? "good" : "default"}
          sub={<>{plural(c.families_paid, "family", "families")} paid · ticked at the fee counter</>}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card title="Calls per day" description="Every call, about fees or anything else, and how many got through.">
            {c.calls === 0 ? (
              <Empty title="No calls in this period" icon={PhoneCall} />
            ) : d.period.days > 1 ? (
              <CallsTrendChart data={trend} />
            ) : (
              <>
                <StackedBar
                  height="h-3"
                  segments={[
                    { value: c.connected, className: "bg-series-1", label: "Picked up", display: String(c.connected) },
                    { value: c.not_reached, className: "bg-series-track", label: "Not reached", display: String(c.not_reached) },
                  ]}
                />
                <Legend
                  className="mt-3"
                  items={[
                    { label: "Picked up", className: "bg-series-1", value: String(c.connected) },
                    { label: "Not reached", className: "bg-series-track", value: String(c.not_reached) },
                  ]}
                />
              </>
            )}
          </Card>

          <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            <Card title="How the calls went">
              {c.calls === 0 ? (
                <p className="text-footnote text-muted">No calls yet.</p>
              ) : (
                <BarList
                  compact
                  rows={OUTCOMES.filter((o) => (c.by_outcome[o] ?? 0) > 0).map((o) => ({
                    label: OUTCOME_LABELS[o],
                    value: c.by_outcome[o] ?? 0,
                    display: String(c.by_outcome[o]),
                    sub: pct(ratioPct(c.by_outcome[o] ?? 0, c.calls), 0),
                  }))}
                />
              )}
            </Card>
            <Card title="What families said about fees">
              {Object.keys(c.by_response).length === 0 ? (
                <p className="text-footnote text-muted">Nothing recorded yet.</p>
              ) : (
                <BarList
                  compact
                  color="bg-series-3"
                  rows={RESPONSES.filter((r) => (c.by_response[r] ?? 0) > 0).map((r) => ({
                    label: RESPONSE_LABELS[r],
                    value: c.by_response[r] ?? 0,
                    display: String(c.by_response[r]),
                  }))}
                />
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-5">
          <Card
            title="Does calling make a difference?"
            description="Families we spoke to about fees in the period (paid on or after the call) against the other families with fees due (something to recover now, or who paid fees due now in the period)."
          >
            {d.impact.spoke === 0 && d.impact.others === 0 ? (
              <p className="text-footnote text-muted">No families with fees due in this period.</p>
            ) : (
              <div className="space-y-4">
                <Compare label="We spoke to them" pctValue={d.impact.spoke_pct} paid={d.impact.spoke_paid} of={d.impact.spoke} amount={d.impact.spoke_amount} color="bg-series-1" />
                <Compare label="Not spoken to" pctValue={d.impact.others_pct} paid={d.impact.others_paid} of={d.impact.others} amount={d.impact.others_amount} color="bg-tile-gray" />
                {d.impact.spoke === 0 ? (
                  <p className="rounded-xl bg-fill-2 px-3 py-2 text-footnote text-ink">No fee call got through in this period, so the effect cannot be measured yet.</p>
                ) : (
                  d.impact.lift !== null && (
                    <p className="rounded-xl bg-fill-2 px-3 py-2 text-footnote text-ink">
                      {d.impact.lift >= 1.1
                        ? `Talking to a family makes it ${d.impact.lift}× as likely to pay.`
                        : d.impact.lift < 0.9
                          ? "Families we spoke to paid less often than the others. Look at what parents said and the promises."
                          : "No clear difference yet."}
                    </p>
                  )
                )}
              </div>
            )}
          </Card>

          <Card title="Promises made in the period" description="Kept = paid by the promised date, or within the grace days after it.">
            {c.promises === 0 ? (
              <p className="text-footnote text-muted">No promises yet.</p>
            ) : (
              <>
                <StackedBar
                  total={c.promises}
                  segments={[
                    { value: c.kept_on_time, className: "bg-good", label: "By the date", display: String(c.kept_on_time) },
                    { value: c.kept - c.kept_on_time, className: "bg-series-3", label: "Within grace", display: String(c.kept - c.kept_on_time) },
                    { value: c.partial, className: "bg-warning", label: "In part", display: String(c.partial) },
                    { value: c.broken, className: "bg-critical", label: "Broken", display: String(c.broken) },
                  ]}
                />
                <Legend
                  className="mt-3"
                  items={[
                    { label: "By the date", className: "bg-good", value: String(c.kept_on_time) },
                    { label: "Within grace", className: "bg-series-3", value: String(c.kept - c.kept_on_time) },
                    { label: "In part", className: "bg-warning", value: String(c.partial) },
                    { label: "Broken", className: "bg-critical", value: String(c.broken) },
                    { label: "Waiting", className: "bg-fill", value: String(c.pending) },
                  ]}
                />
              </>
            )}
          </Card>

          <Card
            title="Who called the most"
            actions={
              <Link href={withParams("/calls", { view: "callers", period: period.key })} className="text-footnote font-medium text-accent">
                All callers
              </Link>
            }
          >
            {top.length === 0 ? (
              <p className="text-footnote text-muted">No calls in this period.</p>
            ) : (
              <ul className="space-y-3">
                {top.map((x, i) => (
                  <li key={x.user_id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-subhead font-medium text-ink">
                        {i === 0 && <Trophy className="size-3.5 text-warning" aria-label="Most calls" />}
                        <span className="truncate">{x.name}</span>
                      </span>
                      <span className="block text-caption text-muted">
                        {pct(x.connect_pct, 0)} picked up · {rupeesShort(x.recovered)} came in
                      </span>
                    </span>
                    <span className="shrink-0 text-subhead font-semibold tabular text-ink">{plural(x.calls, "call")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="What the calls were about">
            {c.calls === 0 ? (
              <p className="text-footnote text-muted">No calls yet.</p>
            ) : (
              <BarList
                compact
                rows={PURPOSES.filter((p) => (c.by_purpose[p] ?? 0) > 0).map((p) => ({
                  label: PURPOSE_LABELS[p].label,
                  value: c.by_purpose[p] ?? 0,
                  display: String(c.by_purpose[p]),
                  sub: pct(ratioPct(c.by_purpose[p] ?? 0, c.calls), 0),
                }))}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * Every caller's effort (calls, families, days calling) next to the result (picked up, promises kept, money that came in
 * after their calls, money per call). Callers who made no calls in the period are listed too.
 */
export function CallersView({ d, period }: { d: CallAnalytics; period: Period }) {
  const rows = d.calls.by_caller;
  if (rows.length === 0) {
    return (
      <Card>
        <Empty title="Nobody calls yet" icon={UsersRound}>
          Give staff the Caller role in Settings → Staff, or call families from Today&rsquo;s list yourself.
        </Empty>
      </Card>
    );
  }
  const most = Math.max(...rows.map((r) => r.calls));
  const best = rows.filter((r) => r.calls >= 5 && r.per_call !== null).sort((a, b) => (b.per_call ?? 0) - (a.per_call ?? 0))[0];
  return (
    <>
      <p className="text-footnote text-ink-2">
        {period.label}: effort (calls made) next to result (families who picked up, promises kept and the money ticked to their calls at the fee counter).
        {best && (
          <>
            {" "}
            Best result per call: <b className="font-semibold text-ink">{best.name}</b>, {rupeesShort(best.per_call ?? 0)} a call.
          </>
        )}
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((x, i) => (
          <CallerCard key={x.user_id} x={x} rank={i + 1} most={most} />
        ))}
      </div>
    </>
  );
}

function CallerCard({ x, rank, most }: { x: CallerFigures; rank: number; most: number }) {
  const decided = x.kept + x.broken;
  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full text-footnote font-semibold tabular", rank === 1 && x.calls > 0 ? "bg-warning-soft text-warning-ink" : "bg-fill text-ink-2")}>
            {rank === 1 && x.calls > 0 ? <Trophy className="size-4" aria-label="Most calls" /> : rank}
          </span>
          <div className="min-w-0">
            <p className="truncate text-headline font-semibold text-ink">{x.name}</p>
            <p className="text-caption text-muted">{x.role ? ROLE_LABELS[x.role] : "Former staff"}</p>
          </div>
        </div>
        <Link href={withParams("/calls", { view: "assign", caller: x.user_id })} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-fill px-3 text-footnote font-medium text-ink hover:bg-fill-2">
          <UserPlus className="size-3.5" aria-hidden /> Give families
        </Link>
      </div>

      <p className="mt-4 text-caption font-medium uppercase tracking-wide text-muted">Effort</p>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="figure text-title2 text-ink">{plural(x.calls, "call")}</span>
        <span className="text-footnote text-ink-2">
          {plural(x.families, "family", "families")} · {plural(x.days, "day")} · {x.calls_per_day} a day
        </span>
      </div>
      <Meter value={most > 0 ? (100 * x.calls) / most : 0} className="mt-2" />

      <p className="mt-4 text-caption font-medium uppercase tracking-wide text-muted">Result</p>
      <dl className="mt-1 grid grid-cols-2 gap-2">
        <Fig label="Picked up" value={pct(x.connect_pct, 0)} sub={`${x.connected} of ${x.calls}`} />
        <Fig
          label="Promises kept"
          value={decided > 0 ? pct(x.kept_pct, 0) : "—"}
          sub={decided > 0 ? `${x.kept} of ${decided}${x.pending > 0 ? ` · ${x.pending} waiting` : ""}` : x.pending > 0 ? `${x.pending} waiting for their date` : "No promises"}
        />
        <Fig label="Came in after calls" value={rupeesShort(x.recovered)} sub={plural(x.families_paid, "family", "families")} good={x.recovered > 0} />
        <Fig label="Per call" value={x.per_call !== null ? rupeesShort(x.per_call) : "—"} sub="money ÷ calls" good={(x.per_call ?? 0) > 0} />
      </dl>
    </section>
  );
}

function Fig({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="rounded-2xl bg-fill-2 px-3 py-2.5">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className={cn("figure mt-0.5 text-title3", good ? "text-good-ink" : "text-ink")}>{value}</dd>
      <dd className="truncate text-caption text-muted">{sub}</dd>
    </div>
  );
}

function Compare({ label, pctValue, paid, of, amount, color }: { label: string; pctValue: number | null; paid: number; of: number; amount: number; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-subhead text-ink">{label}</span>
        <span className="figure text-title3 text-ink">{pct(pctValue, 0)}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-fill-2" aria-hidden>
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.max(0, Math.min(100, pctValue ?? 0))}%` }} />
      </div>
      <p className="mt-1 text-caption text-muted">
        {paid} of {plural(of, "family", "families")} paid · {rupeesShort(amount)}
      </p>
    </div>
  );
}
