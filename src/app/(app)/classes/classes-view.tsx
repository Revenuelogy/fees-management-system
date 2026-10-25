"use client";

import Link from "next/link";
import { MONEY } from "@/lib/glossary";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { ClassSummaryRow } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";

import { Legend, StackedBar } from "@/components/ui/bars";
import { Ring } from "@/components/ui/ring";
import { FEE_STATUS, STATUS_STYLE } from "@/components/ui/status";
import { NoSession } from "@/components/no-session";

const STATUS: { key: keyof ClassSummaryRow["status"]; cls: string; label: string }[] = (["paid_up", "partial", "arrears_only", "not_paying", "free"] as const).map(
  (k) => ({ key: k, cls: STATUS_STYLE[k].dot, label: FEE_STATUS[k].label }),
);

export function ClassesView() {
  const { session } = useApp();
  // this year's figures only; each class's old balance is shown as its own figure
  const summary = useApi<ClassSummaryRow[]>(session ? apiUrl("/api/analytics/classes", { session: session.id }) : null);
  if (!session) return <NoSession />;
  if (!summary.data) return <Pending queries={[summary]} />;
  const rows = summary.data;
  const tot = rows.reduce(
    (a, r) => ({ expected: a.expected + r.expected, received: a.received + r.received, pending: a.pending + r.pending }),
    { expected: 0, received: 0, pending: 0 },
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description={`${session.name} · ${rupeesShort(tot.pending)} balance across ${rows.filter((r) => r.class_id).length} classes`}
        info={`Ring = share of the class's total fee received this year. Bar = students by status. ${MONEY.balance.label}: ${MONEY.balance.hint}. ${MONEY.old_balance.label} is shown on its own.`}
      >
        <Legend items={STATUS.slice(0, 4).map((s) => ({ label: s.label, className: s.cls }))} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rows.map((r, i) => {
          const href = r.class_id ? `/classes/${r.class_id}` : "/pending?unassigned=1";
          return (
            <Link
              key={r.class_id ?? "none"}
              href={href}
              className="animate-rise group rounded-[var(--radius-card)] bg-surface p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              title={`${r.class_name}: ${rupees(r.received)} received of ${rupees(r.expected)} total fee, ${rupees(r.pending)} balance`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-headline font-semibold text-ink group-hover:text-accent">{r.class_name}</p>
                  <p className="text-footnote text-ink-2">{r.students} students</p>
                </div>
                <Ring value={r.collection_pct} size={58} stroke={7}>
                  <span className="text-caption font-semibold tabular">{Math.round(r.collection_pct ?? 0)}%</span>
                </Ring>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-caption text-muted">{MONEY.balance.label}</p>
                  <p className="figure text-title2 text-ink">{rupeesShort(r.pending)}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption text-muted">{MONEY.due_now.label}</p>
                  <p className={`text-headline font-semibold tabular ${r.overdue > 0 ? "text-critical-ink" : "text-good-ink"}`}>{rupeesShort(r.overdue)}</p>
                  {r.prev_pending > 0 && <p className="text-caption tabular text-serious-ink">+ {rupeesShort(r.prev_pending)} old balance</p>}
                </div>
              </div>
              <div className="mt-4">
                <StackedBar
                  height="h-2"
                  segments={STATUS.map((s) => ({ value: r.status[s.key] ?? 0, className: s.cls, label: s.label, display: String(r.status[s.key] ?? 0) }))}
                />
                <p className="mt-2 text-caption text-muted">
                  {r.status.paid_up} paid up · {r.status.not_paying + r.status.partial} with fees due · {pct(r.share_of_pending, 0)} of school balance
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-center text-caption text-muted">
        School: {rupeesShort(tot.received)} received of {rupeesShort(tot.expected)} total fee ({pct(ratioPct(tot.received, tot.expected), 0)}) · students who
        left or are not enrolled this year are on{" "}
        <Link href="/pending?unassigned=1" className="text-accent">
          Fees due
        </Link>
      </p>
    </div>
  );
}
