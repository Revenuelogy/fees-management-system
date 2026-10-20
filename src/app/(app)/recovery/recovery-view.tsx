"use client";

import Link from "next/link";
import { CalendarClock, HandCoins, PhoneCall, Plus, Sparkles, Target } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDate, fmtDateShort, num, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import { fmtPhone } from "@/lib/recovery";
import type { CampaignSummary, PromiseListRow, RecoveryOverview } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { IconTile, Kpi } from "@/components/ui/kpi";
import { Badge } from "@/components/ui/badge";
import { Legend, Meter, StackedBar } from "@/components/ui/bars";
import { LinkButton } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { PromiseBadge } from "@/components/recovery";

export function RecoveryView() {
  const { writer } = useApp();
  const res = useApi<RecoveryOverview>("/api/recovery");
  if (!res.data) return <Pending queries={[res]} />;
  const d = res.data;
  const k = d.kpis;
  const active = d.campaigns.filter((c) => c.status === "active");
  const closed = d.campaigns.filter((c) => c.status === "closed");
  const firstCalls = active.find((c) => c.kind === "calls" && (c.to_call ?? 0) > 0) ?? active.find((c) => c.kind === "calls");
  const resolved = k.kept_90 + k.partial_90 + k.broken_90;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fee recovery"
        description="Calls to parents and student activities that bring the fees in."
        info={`A promise is kept when the family pays by the promised date, or within ${d.grace_days} grace ${d.grace_days === 1 ? "day" : "days"} after it (Settings). Families who break a promise are back on the call list the next day.`}
        actions={
          writer && (
            <>
              <LinkButton href="/recovery/new?kind=activity">
                <Sparkles className="size-4" /> New activity
              </LinkButton>
              <LinkButton href="/recovery/new?kind=calls" variant="primary">
                <Plus className="size-4" /> New call campaign
              </LinkButton>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={PhoneCall}
          color="orange"
          label="Families to call now"
          value={num(k.families_to_call)}
          href={firstCalls ? `/recovery/${firstCalls.id}` : undefined}
          sub={<>{num(k.calls_today)} calls today · {num(k.calls_week)} this week ({pct(ratioPct(k.connected_week, k.calls_week), 0)} picked up)</>}
        />
        <Kpi
          icon={CalendarClock}
          color="blue"
          label="Promises waiting"
          value={num(k.promises_pending)}
          sub={k.promises_pending > 0 ? <>{rupeesShort(k.promised_pending_amount)} promised · {num(k.promises_due_week)} due within a week</> : "No open promises"}
        />
        <Kpi
          icon={Target}
          color="green"
          label="Promises kept"
          value={resolved > 0 ? pct(k.kept_pct_90, 0) : "—"}
          meter={k.kept_pct_90}
          hint="Promises with a date in the last 90 days whose deadline has passed."
          sub={resolved > 0 ? <>{k.kept_90} kept · {k.partial_90} in part · {k.broken_90} broken</> : "No promise has fallen due yet"}
        />
        <Kpi
          icon={HandCoins}
          color="teal"
          label="Recovered"
          value={rupeesShort(k.recovered_calls + k.recovered_activities)}
          hint="Calls: what called families paid from their first call to the campaign's end. Activities: receipts the accountant counted for the activity."
          sub={<>{rupeesShort(k.recovered_calls)} after calls · {rupeesShort(k.recovered_activities)} from activities</>}
        />
      </div>

      {d.campaigns.length === 0 ? (
        <Card>
          <Empty title="No campaigns yet" icon={PhoneCall}>
            Start a call campaign to get a daily list of families to call, or an activity for students whose fees are pending.
          </Empty>
        </Card>
      ) : (
        <section>
          <h2 className="mb-3 text-headline font-semibold text-ink">Running</h2>
          {active.length === 0 ? (
            <p className="text-footnote text-ink-2">Nothing running right now.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {active.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card title="Promises falling due" description="The latest promise of each family that is still waiting, soonest first.">
          <PromiseList rows={d.upcoming_promises} today={d.today} empty="No promise is waiting." />
        </Card>
        <Card title="Broken promises" description="Promises whose date (plus grace) passed in the last 30 days without the money. These families are on the call list.">
          <PromiseList rows={d.broken_promises} today={d.today} empty="No broken promises in the last 30 days." />
        </Card>
      </div>

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-headline font-semibold text-ink">Closed</h2>
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {closed.map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: CampaignSummary }) {
  const calls = c.kind === "calls";
  return (
    <li>
      <Link href={`/recovery/${c.id}`} className="group block h-full rounded-[var(--radius-card)] bg-surface p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5">
        <div className="flex items-start gap-3">
          <IconTile icon={calls ? PhoneCall : Sparkles} color={calls ? "orange" : "indigo"} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-headline font-semibold text-ink group-hover:text-accent">{c.name}</span>
              {c.status === "closed" && <Badge>Closed</Badge>}
            </div>
            <p className="text-caption text-muted">
              {calls ? "Call campaign" : "Student activity"} · from {fmtDate(c.start_date)}
              {c.end_date && ` to ${fmtDate(c.end_date)}`}
            </p>
          </div>
          <div className="text-right">
            <p className="figure text-title2 leading-none text-ink">{rupeesShort(c.recovered)}</p>
            <p className="mt-1 text-caption text-muted">{calls ? "recovered" : "deposited"}</p>
          </div>
        </div>
        {c.description && <p className="mt-3 line-clamp-2 text-footnote text-ink-2">{c.description}</p>}

        {calls ? (
          <dl className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-fill-2 p-3 text-center">
            {[
              ["To call", c.to_call ?? "—", c.status === "active" && (c.to_call ?? 0) > 0],
              ["Calls", c.calls, false],
              ["Kept", c.kept, false],
              ["Broken", c.broken, false],
            ].map(([label, value, hot]) => (
              <div key={label as string}>
                <dd className={cn("text-headline font-semibold tabular", hot ? "text-accent" : "text-ink")}>{value as string | number}</dd>
                <dt className="text-caption text-muted">{label as string}</dt>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-4">
            <StackedBar
              total={c.participants}
              segments={[
                { value: c.positive, className: "bg-good", label: "Fees deposited", display: String(c.positive) },
                { value: c.partial, className: "bg-warning", label: "Paid part", display: String(c.partial) },
                { value: c.negative, className: "bg-critical", label: "No / declined", display: String(c.negative) },
              ]}
            />
            <Legend
              className="mt-2"
              items={[
                { label: "Deposited", className: "bg-good", value: String(c.positive) },
                { label: "Part", className: "bg-warning", value: String(c.partial) },
                { label: "Declined", className: "bg-critical", value: String(c.negative) },
                { label: "Waiting", className: "bg-fill", value: String(c.pending) },
              ]}
            />
          </div>
        )}
        {c.target_amount && (
          <div className="mt-3">
            <Meter value={ratioPct(c.recovered, c.target_amount)} color="bg-good" track="bg-good-soft" />
            <p className="mt-1 text-caption text-muted">
              {pct(ratioPct(c.recovered, c.target_amount), 0)} of the {rupeesShort(c.target_amount)} target
            </p>
          </div>
        )}
      </Link>
    </li>
  );
}

function PromiseList({ rows, today, empty }: { rows: PromiseListRow[]; today: string; empty: string }) {
  if (rows.length === 0) return <p className="text-footnote text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={`${r.parent_id}:${r.promised_date}`} className="flex items-center gap-3 py-2.5">
          <span
            className={cn(
              "inline-flex w-14 shrink-0 flex-col items-center rounded-xl py-1 text-center",
              r.status ? "bg-critical-soft text-critical-ink" : r.promised_date <= today ? "bg-accent-soft text-accent" : "bg-fill-2 text-ink",
            )}
          >
            <span className="text-caption font-semibold">{fmtDateShort(r.promised_date)}</span>
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/parents/${r.parent_id}`} className="block truncate text-subhead font-medium text-ink hover:text-accent">
              {r.name}
            </Link>
            <p className="truncate text-caption text-muted">
              {fmtPhone(r.phone)} · {r.source === "note" ? `note on ${r.student_name ?? "a child"}` : (r.campaign_name ?? "call")}
              {r.paid > 0 && <> · {rupees(r.paid)} paid</>}
            </p>
          </div>
          <span className="shrink-0 text-right text-subhead font-semibold tabular text-ink">{r.promised_amount ? rupeesShort(r.promised_amount) : "—"}</span>
          {r.status && <PromiseBadge status={r.status} />}
        </li>
      ))}
    </ul>
  );
}
