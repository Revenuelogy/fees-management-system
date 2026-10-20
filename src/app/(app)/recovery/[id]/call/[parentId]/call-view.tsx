"use client";

import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDate, rupees, rupeesShort } from "@/lib/format";
import { ATTITUDE_LABELS, QUEUE_STATES, fmtPhone } from "@/lib/recovery";
import type { CallCampaignDetail, CampaignDetail, Parent360 } from "@/lib/types";
import { NotFoundCard, Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { FeeStatusBadge } from "@/components/ui/status";
import { BehaviourBadge, EconomicBadge, PromiseLine, ReasonBadges } from "@/components/recovery";
import { CallForm } from "../../../../parents/call-form";
import { CallHistory } from "../../../../parents/call-history";

/** One family from a campaign's call list: everything to know before and during the call, and the call log form. */
export function CallView({ campaignId, parentId }: { campaignId: string; parentId: string }) {
  // no background refresh while the call is being logged
  const camp = useApi<CampaignDetail>(`/api/recovery/campaigns/${campaignId}`, { refreshInterval: 0, revalidateOnFocus: false });
  const fam = useApi<Parent360>(`/api/parents/${parentId}`, { refreshInterval: 0, revalidateOnFocus: false });
  if (!camp.data || !fam.data) return <Pending queries={[camp, fam]} />;
  if (camp.data.kind !== "calls") return <NotFoundCard />;
  return <Workspace c={camp.data} f={fam.data} parentId={parentId} />;
}

function Workspace({ c, f, parentId }: { c: CallCampaignDetail; f: Parent360; parentId: string }) {
  const p = f.parent;
  const t = f.totals;
  const base = `/recovery/${c.campaign.id}`;
  const row = c.rows.find((r) => r.parent_id === parentId);
  const due = c.rows.filter((r) => r.state === "due");
  const position = due.findIndex((r) => r.parent_id === parentId);
  const next = due.find((r, i) => r.parent_id !== parentId && (position < 0 || i > position)) ?? due.find((r) => r.parent_id !== parentId);
  const nextHref = next ? `${base}/call/${next.parent_id}` : base;
  const latest = f.promises[0];
  const owing = f.children.filter((k) => k.in_session && k.total_pending > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={p.name}
        crumbs={[{ label: "Fee recovery", href: "/recovery" }, { label: c.campaign.name, href: base }, { label: p.name }]}
        description={
          row
            ? row.state === "due"
              ? `${position + 1} of ${due.length} to call in ${c.campaign.name}`
              : `${QUEUE_STATES[row.state].label}${row.next_call_on ? ` · back on the list ${fmtDate(row.next_call_on)}` : ""}`
            : `Not on the list of ${c.campaign.name}`
        }
        actions={
          next && (
            <LinkButton href={`${base}/call/${next.parent_id}`}>
              Skip to next <ArrowRight className="size-4" />
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
          {row && <ReasonBadges reasons={row.reasons} />}
        </div>
        {latest && (
          <p className="mt-3 text-footnote">
            <PromiseLine date={latest.promised_date} amount={latest.promised_amount} status={latest.status} timing={latest.timing} paid={latest.paid} />
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <div className="space-y-5 xl:col-span-3">
          <Card title="What to talk about" actions={<Link href={`/parents/${parentId}`} className="text-footnote font-medium text-accent">Full profile</Link>}>
            {t && (
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-fill-2 p-3 text-center">
                <div>
                  <p className="text-headline font-semibold tabular text-critical-ink">{rupeesShort(t.total_overdue)}</p>
                  <p className="text-caption text-muted">overdue now</p>
                </div>
                <div>
                  <p className={cn("text-headline font-semibold tabular", t.prev_pending > 0 ? "text-serious-ink" : "text-ink")}>{rupeesShort(t.prev_pending)}</p>
                  <p className="text-caption text-muted">old dues</p>
                </div>
                <div>
                  <p className="text-headline font-semibold tabular text-ink">{t.last_paid_on ? fmtDate(t.last_paid_on) : "Never"}</p>
                  <p className="text-caption text-muted">{t.days_since_payment !== null ? `last paid · ${t.days_since_payment} days ago` : "last paid"}</p>
                </div>
              </div>
            )}
            <ul className="mt-4 space-y-2">
              {owing.length === 0 && <li className="text-footnote text-muted">No child owes anything right now.</li>}
              {owing.map((k) => (
                <li key={k.student_id} className="flex items-center justify-between gap-3 text-subhead">
                  <Link href={`/students/${k.student_id}`} className="min-w-0 truncate font-medium text-ink hover:text-accent">
                    {k.full_name}
                    <span className="ml-1.5 text-caption font-normal text-muted">
                      {k.class_name ? `${k.class_name} · ${k.section}` : "Not enrolled"}
                    </span>
                  </Link>
                  <span className="shrink-0 tabular">
                    <span className={cn("font-semibold", k.total_overdue > 0 ? "text-critical-ink" : "text-ink")}>{rupees(k.total_overdue)}</span>
                    <span className="ml-1 text-caption text-muted">of {rupeesShort(k.total_pending)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-subhead">
              {[
                ["Main concern about the child", p.concerns],
                ["What matters most to them", p.priorities],
                ["How they behave", p.behaviour_notes],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-caption font-medium text-muted">{k}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-ink">{v}</dd>
                  </div>
                ))}
              {f.reliability.made > 0 && (
                <div>
                  <dt className="text-caption font-medium text-muted">Promises so far</dt>
                  <dd className="mt-0.5 text-ink">
                    {f.reliability.kept} kept · {f.reliability.partial} in part · {f.reliability.broken} broken
                    {f.reliability.pending > 0 && <> · {f.reliability.pending} waiting</>}
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          <Card title="Earlier calls">
            <CallHistory parentId={parentId} calls={f.calls} canDelete={false} limit={5} />
          </Card>
        </div>

        {/* on a phone the form comes right after the number to dial */}
        <div className="order-first xl:order-none xl:col-span-2">
          <Card title="Log this call" className="xl:sticky xl:top-20">
            {c.campaign.status === "active" ? (
              <CallForm parentId={parentId} today={c.today} graceDays={c.grace_days} campaignId={c.campaign.id} nextHref={nextHref} />
            ) : (
              <p className="text-footnote text-ink-2">This campaign is closed. Log calls from the parent&rsquo;s profile, or reopen the campaign.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
