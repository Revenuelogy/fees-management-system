"use client";

import { HandCoins, MessageSquareText, Pencil, PhoneCall, Users } from "lucide-react";
import { fmtDate, fmtDateShort, num, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import {
  OUTCOMES, OUTCOME_LABELS, PICKED_BY_LABELS, PROMISE_LABELS, QUEUE_STATES, REASON_LABELS, RESPONSES, RESPONSE_LABELS, fmtPhone,
  type QueueState,
} from "@/lib/recovery";
import type { CallCampaignDetail } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { BarList, Legend, Meter, StackedBar } from "@/components/ui/bars";
import { LinkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";

const TABS = [
  { key: "due", label: "To call", states: ["due"] },
  { key: "promised", label: "Promised", states: ["promised"] },
  { key: "waiting", label: "Called recently", states: ["waiting"] },
  { key: "done", label: "Done / off the list", states: ["cleared", "off_list"] },
  { key: "log", label: "Call log", states: [] },
] as const satisfies readonly { key: string; label: string; states: readonly QueueState[] }[];

export function CallsView({ d, tab }: { d: CallCampaignDetail; tab?: string }) {
  const { writer } = useApp();
  const c = d.campaign;
  const s = d.stats;
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const base = `/recovery/${c.id}`;
  const count = (k: (typeof TABS)[number]) => (k.key === "log" ? s.calls : d.rows.filter((r) => (k.states as readonly string[]).includes(r.state)).length);
  const running = c.status === "active";

  const rules = [
    ...(c.silent_days !== null ? [`nothing paid for ${c.silent_days} days`] : []),
    ...(c.high_due !== null ? [`owes ${rupeesShort(c.high_due)}+`] : []),
    ...(c.include_old_dues ? ["old dues"] : []),
    ...(c.include_broken ? ["a broken promise"] : []),
  ];
  const resolved = s.kept + s.partial + s.broken;

  const rows = d.rows
    .filter((r) => (current.states as readonly string[]).includes(r.state))
    .map((r) => ({
      ...r,
      id: r.parent_id,
      kids: r.children.map((k) => `${k.full_name.split(" ")[0]}${k.class_name ? ` (${k.class_name})` : ""}`).join(", "),
      phone_display: fmtPhone(r.phone),
      why: r.reasons.map((x) => REASON_LABELS[x].label).join(", "),
      last_call: r.last_call_on ? `${fmtDateShort(r.last_call_on)} · ${r.last_outcome ? OUTCOME_LABELS[r.last_outcome] : ""}` : "Not called yet",
      last_said: r.last_response ? RESPONSE_LABELS[r.last_response] : r.last_summary,
      promise:
        r.promise_date && r.promise_status
          ? `${r.promise_amount ? rupees(r.promise_amount) : "Pay"} by ${fmtDate(r.promise_date)} · ${PROMISE_LABELS[r.promise_status].label}`
          : null,
      call: running ? "Call" : "Open",
    }));

  const columns: Column[] = [
    { key: "name", label: "Family", type: "person", href: `${base}/call/{parent_id}`, sub: "kids" },
    { key: "phone_display", label: "Phone", className: "whitespace-nowrap", sub: "best_time_to_call", hideOnMobile: true },
    ...(current.key === "due" ? [{ key: "why", label: "Why call", className: "min-w-[160px]" } as Column] : []),
    { key: "total_overdue", label: "Overdue", type: "money", total: true, alertPositive: true },
    { key: "days_since_payment", label: "Silent", type: "number", hideOnMobile: true },
    { key: "last_call", label: "Last call", className: "min-w-[150px]", sub: "last_said", hideOnMobile: true },
    ...(current.key === "promised" ? [{ key: "promise", label: "Promise", className: "min-w-[160px]" } as Column] : []),
    ...(current.key === "waiting" || current.key === "promised" ? [{ key: "next_call_on", label: "Back on the list", type: "date" } as Column] : []),
    ...(current.key === "due" ? [{ key: "priority", label: "Priority", type: "number", hideOnMobile: true } as Column] : []),
    { key: "call", label: "", type: "action", href: `${base}/call/{parent_id}`, sortable: false },
  ];

  const logRows = d.recent_calls.map((x) => ({
    ...x,
    who: x.picked_by ? PICKED_BY_LABELS[x.picked_by] : null,
    outcome_label: OUTCOME_LABELS[x.outcome],
    said: x.response ? RESPONSE_LABELS[x.response] : null,
    promise: x.promised_date ? `${x.promised_amount ? rupees(x.promised_amount) : "Pay"} by ${fmtDate(x.promised_date)}` : null,
    promise_result: x.promise_status ? PROMISE_LABELS[x.promise_status].label : null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={c.name}
        crumbs={[{ label: "Fee recovery", href: "/recovery" }, { label: c.name }]}
        description={`Call campaign · from ${fmtDate(c.start_date)}${c.end_date ? ` to ${fmtDate(c.end_date)}` : ""}${running ? "" : " · closed, no new calls are logged in it"}`}
        info={c.description ?? undefined}
        actions={
          writer && (
            <LinkButton href={`${base}/edit`}>
              <Pencil className="size-4" /> Edit rules
            </LinkButton>
          )
        }
      >
        <p className="text-footnote text-ink-2">
          Families owing {rupees(c.min_due)}+ overdue{c.classes.length > 0 && <> with a child in {c.classes.map((k) => k.name).join(", ")}</>}
          {rules.length > 0 ? <> and any of: {rules.join(" · ")}</> : null}. Called again after {c.recall_days} days.
        </p>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Users}
          color="orange"
          label="To call now"
          value={num(s.due)}
          href={withParams(base, { tab: "due" })}
          sub={<>{rupeesShort(s.due_overdue)} overdue · {s.broken} broke a promise</>}
        />
        <Kpi
          icon={PhoneCall}
          color="blue"
          label="Calls made"
          value={num(s.calls)}
          meter={ratioPct(s.connected, s.calls)}
          sub={<>{pct(ratioPct(s.connected, s.calls), 0)} picked up · {s.parents_called} families · {s.calls_today} today</>}
          href={withParams(base, { tab: "log" })}
        />
        <Kpi
          icon={MessageSquareText}
          color="indigo"
          label="Promises"
          value={num(s.promises)}
          sub={<>{s.kept} kept · {s.partial} in part · {s.broken} broken · {s.pending} waiting</>}
          href={withParams(base, { tab: "promised" })}
        />
        <Kpi
          icon={HandCoins}
          color="green"
          label="Recovered after calls"
          value={rupeesShort(s.recovered)}
          meter={c.target_amount ? ratioPct(s.recovered, c.target_amount) : undefined}
          hint="What the called families paid from their first call in this campaign to its end (or today)."
          sub={c.target_amount ? <>{pct(ratioPct(s.recovered, c.target_amount), 0)} of {rupeesShort(c.target_amount)} · {s.families_paid} families paid</> : <>{s.families_paid} families paid</>}
        />
      </div>

      <div className="space-y-3">
        <Segmented options={TABS.map((t) => ({ label: `${t.label} ${count(t)}`, href: withParams(base, { tab: t.key === "due" ? undefined : t.key }), active: t.key === current.key }))} />
        <Card>
          {current.key === "log" ? (
            <DataTable
              rows={logRows as unknown as Record<string, unknown>[]}
              columns={[
                { key: "call_date", label: "Date", type: "date" },
                { key: "parent_name", label: "Family", href: `/parents/{parent_id}`, sub: "who" },
                { key: "outcome_label", label: "Call", sub: "said" },
                { key: "summary", label: "What they said", className: "min-w-[220px]" },
                { key: "promise", label: "Promise", sub: "promise_result", hideOnMobile: true },
                { key: "author", label: "By", hideOnMobile: true },
              ]}
              searchKeys={["parent_name", "summary", "phone", "author"]}
              filters={[
                { key: "outcome_label", label: "Call", options: OUTCOMES.map((o) => ({ value: OUTCOME_LABELS[o], label: OUTCOME_LABELS[o] })) },
                { key: "said", label: "Said", options: RESPONSES.map((r) => ({ value: RESPONSE_LABELS[r], label: RESPONSE_LABELS[r] })) },
              ]}
              exportName={`calls-${c.name}`}
              exportMeta={[`Campaign ${c.name}`, "Latest 50 calls"]}
              empty="No calls logged yet."
            />
          ) : (
            <DataTable
              rows={rows as unknown as Record<string, unknown>[]}
              columns={columns}
              searchKeys={["name", "phone", "kids", "why"]}
              searchPlaceholder="Search family, phone, child…"
              defaultSort={current.key === "due" ? { key: "priority", dir: "desc" } : undefined}
              exportName={`call-list-${c.name}-${current.key}`}
              exportMeta={[`Campaign ${c.name}`, `${current.label} as of ${fmtDate(d.today)}`, QUEUE_STATES[current.states[0] ?? "due"].hint]}
              empty={current.key === "due" ? "Nobody to call right now." : "No families here."}
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Promises" description={`Kept = paid by the promised date, or within ${d.grace_days} grace ${d.grace_days === 1 ? "day" : "days"} after it.`}>
          {s.promises === 0 ? (
            <p className="text-footnote text-muted">No promises yet.</p>
          ) : (
            <>
              <StackedBar
                total={s.promises}
                segments={[
                  { value: s.kept_early + s.kept_on_date, className: "bg-good", label: "By the date", display: String(s.kept_early + s.kept_on_date) },
                  { value: s.kept_grace, className: "bg-series-3", label: "Within grace", display: String(s.kept_grace) },
                  { value: s.partial, className: "bg-warning", label: "In part", display: String(s.partial) },
                  { value: s.broken, className: "bg-critical", label: "Broken", display: String(s.broken) },
                ]}
              />
              <Legend
                className="mt-3"
                items={[
                  { label: "By the date", className: "bg-good", value: String(s.kept_early + s.kept_on_date) },
                  { label: "Within grace", className: "bg-series-3", value: String(s.kept_grace) },
                  { label: "In part", className: "bg-warning", value: String(s.partial) },
                  { label: "Broken", className: "bg-critical", value: String(s.broken) },
                  { label: "Waiting", className: "bg-fill", value: String(s.pending) },
                ]}
              />
              <p className="mt-3 text-footnote text-ink-2">
                {resolved > 0 ? <>{pct(ratioPct(s.kept, resolved), 0)} of the promises that fell due were kept. </> : null}
                {rupeesShort(s.promise_paid)} paid against {rupeesShort(s.promised_amount)} promised.
              </p>
            </>
          )}
        </Card>

        <Card title="How the calls went">
          {s.calls === 0 ? (
            <p className="text-footnote text-muted">No calls yet.</p>
          ) : (
            <BarList
              compact
              rows={OUTCOMES.filter((o) => (d.by_outcome[o] ?? 0) > 0).map((o) => ({
                label: OUTCOME_LABELS[o],
                value: d.by_outcome[o] ?? 0,
                display: String(d.by_outcome[o]),
                sub: pct(ratioPct(d.by_outcome[o] ?? 0, s.calls), 0),
              }))}
            />
          )}
        </Card>

        {s.connected > 0 && (
          <Card title="What parents said" description="When the call got through.">
            <BarList
              compact
              rows={RESPONSES.filter((r) => (d.by_response[r] ?? 0) > 0)
                .map((r) => ({ label: RESPONSE_LABELS[r], value: d.by_response[r] ?? 0, display: String(d.by_response[r]) }))
                .sort((a, b) => b.value - a.value)}
            />
          </Card>
        )}

        {d.by_staff.length > 0 && (
          <Card title="Who called">
            <ul className="space-y-3">
              {d.by_staff.map((x) => (
                <li key={x.name}>
                  <div className="flex items-baseline justify-between gap-2 text-subhead">
                    <span className="text-ink">{x.name}</span>
                    <span className="tabular">
                      <span className="font-semibold text-ink">{x.calls}</span>
                      <span className="ml-1.5 text-footnote text-muted">
                        {x.connected} picked up · {x.promises} promises
                      </span>
                    </span>
                  </div>
                  <Meter value={ratioPct(x.connected, x.calls)} className="mt-1.5" />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
