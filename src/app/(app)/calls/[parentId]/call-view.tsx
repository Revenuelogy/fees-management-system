"use client";

import { ArrowRight, Phone } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { fmtDate, fmtTime } from "@/lib/format";
import { ATTITUDE_LABELS, CALL_STATES, OUTCOME_LABELS, REASON_LABELS, fmtPhone } from "@/lib/recovery";
import type { CallBoard, CallListRow, Parent360 } from "@/lib/types";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FeeStatusBadge } from "@/components/ui/status";
import { BehaviourBadge, EconomicBadge, PromiseLine, ReasonBadges } from "@/components/recovery";
import { CallForm } from "../../parents/call-form";
import { FamilyProfile } from "./family-profile";

/** One family: everything to know before and during the call (read-only), and the form to log it. */
export function CallView({ parentId }: { parentId: string }) {
  // no background refresh while the call is being logged
  const board = useApi<CallBoard>("/api/calls", { refreshInterval: 0, revalidateOnFocus: false });
  const fam = useApi<Parent360>(`/api/parents/${parentId}`, { refreshInterval: 0, revalidateOnFocus: false });
  if (!board.data || !fam.data) return <Pending queries={[board, fam]} />;
  return <Workspace b={board.data} f={fam.data} parentId={parentId} />;
}

/** The next family to call after this one: next on my list, else the next nobody has taken. */
function nextFamily(b: CallBoard, parentId: string): CallListRow | undefined {
  const due = b.rows.filter((r) => r.state === "due" && r.parent_id !== parentId);
  const here = b.rows.find((r) => r.parent_id === parentId)?.rank ?? 0;
  const mine = due.filter((r) => r.assigned_to === b.me.id);
  const open = due.filter((r) => r.assigned_to === null);
  return mine.find((r) => (r.rank ?? 0) > here) ?? mine[0] ?? open.find((r) => (r.rank ?? 0) > here) ?? open[0];
}

function Workspace({ b, f, parentId }: { b: CallBoard; f: Parent360; parentId: string }) {
  const p = f.parent;
  const t = f.totals;
  const row = b.rows.find((r) => r.parent_id === parentId);
  const next = nextFamily(b, parentId);
  const latest = f.promises[0];
  const status = !row
    ? "Not on today's call list"
    : row.state === "due"
      ? `No. ${row.rank} on today's list${row.assigned_name ? ` · with ${row.assigned_to === b.me.id ? "you" : row.assigned_name}` : ""}`
      : row.state === "called" && row.today_call
        ? `Called today at ${fmtTime(row.today_call.called_at)}${row.today_call.caller_name ? ` by ${row.today_call.caller_name}` : ""} · ${OUTCOME_LABELS[row.today_call.outcome]}`
        : CALL_STATES[row.state].label;

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.name}
        crumbs={[{ label: "Calls", href: "/calls" }, { label: p.name }]}
        description={status}
        actions={
          next && (
            <LinkButton href={`/calls/${next.parent_id}`}>
              Next family <ArrowRight className="size-4" />
            </LinkButton>
          )
        }
      />

      <section className="rounded-[28px] bg-surface p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`tel:${p.phone}`}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 text-title3 font-semibold text-accent-ink shadow-[0_2px_8px_rgba(0,113,227,0.3)] hover:bg-accent-strong"
          >
            <Phone className="size-5" /> {fmtPhone(p.phone)}
          </a>
          {p.alt_phone && (
            <a href={`tel:${p.alt_phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-fill px-4 text-subhead font-medium text-ink hover:bg-fill-2">
              <Phone className="size-4" /> {fmtPhone(p.alt_phone)}
            </a>
          )}
          {p.best_time_to_call && <span className="text-footnote text-ink-2">Best time: {p.best_time_to_call}</span>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <FeeStatusBadge status={t?.family_status} />
          <BehaviourBadge value={p.payment_behaviour} />
          <EconomicBadge value={p.economic_status} />
          {p.attitude && <Badge tone={p.attitude === "difficult" ? "critical" : p.attitude === "demanding" ? "serious" : "neutral"}>{ATTITUDE_LABELS[p.attitude]}</Badge>}
          {row && row.state === "due" && <ReasonBadges reasons={row.reasons} />}
        </div>
        {row?.state === "due" && row.reasons[0] && (
          <p className="mt-3 text-footnote text-ink-2">Why today: {REASON_LABELS[row.reasons[0]].hint.toLowerCase()}.</p>
        )}
        {latest && (
          <p className="mt-3 text-footnote">
            <PromiseLine date={latest.promised_date} amount={latest.promised_amount} status={latest.status} timing={latest.timing} paid={latest.paid} />
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <FamilyProfile f={f} parentId={parentId} />
        </div>

        {/* on a phone the form comes right after the number to dial */}
        <div className="order-first xl:order-none xl:col-span-2">
          <Card title="Log this call" className="xl:sticky xl:top-20" subtitle={row?.state === "called" ? `Already called today · ${fmtDate(b.today)}` : undefined}>
            <CallForm parentId={parentId} today={b.today} graceDays={f.grace_days} nextHref={next ? `/calls/${next.parent_id}` : "/calls"} />
          </Card>
        </div>
      </div>
    </div>
  );
}
