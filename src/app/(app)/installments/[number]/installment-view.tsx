"use client";

import Link from "next/link";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import { MONEY } from "@/lib/glossary";
import type { InstallmentDetail } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { BarList, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { Ring } from "@/components/ui/ring";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { NoSession } from "@/components/no-session";

const GROUPS = {
  full: { label: "Paid in full", dot: "bg-good", text: "text-good-ink" },
  over_half: { label: "Paid over half", dot: "bg-warning", text: "text-warning-ink" },
  under_half: { label: "Paid under half", dot: "bg-serious", text: "text-serious-ink" },
  nothing: { label: "Paid nothing", dot: "bg-critical", text: "text-critical-ink" },
} as const;

// lateness reads as severity: blue on time, then yellow → amber → red
const TIMING_COLOR = ["bg-series-1", "bg-warning", "bg-serious", "bg-critical"];

const TIMING_LABEL = {
  on_time: "By the due date",
  late_15: "1–15 days late",
  late_30: "16–30 days late",
  late_30_plus: "Over 30 days late",
} as const;

export function InstallmentView({ number, sp }: { number: string; sp: SearchParams }) {
  const { session } = useApp();
  const list = param(sp.list) === "all" ? "all" : "top";
  const res = useApi<{ detail: InstallmentDetail; siblings: { number: number; name: string }[] }>(
    session ? apiUrl(`/api/analytics/installments/${encodeURIComponent(number)}`, { session: session.id }) : null,
  );
  if (!session) return <NoSession />;
  if (!res.data) return <Pending queries={[res]} />;
  const { detail: d, siblings } = res.data;
  const s = d.summary;
  const isDue = d.installment.due_date <= d.today;
  const topHalf = d.students.filter((x) => x.in_top_half);
  const topHalfGap = topHalf.reduce((a, x) => a + x.gap, 0);
  const timingTotal = d.timing.reduce((a, t) => a + t.amount, 0);
  // what is left of this installment is Due now once its date has passed, Due later before that
  const left = isDue ? MONEY.due_now.label : MONEY.due_later.label;
  const rows = d.students.map((x) => ({ ...x, who: `${x.class_name}${x.section ? " · " + x.section : ""}` }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={d.installment.name}
        description={`${session.name} · due ${fmtDate(d.installment.due_date)}${d.installment.next_due ? ` · next due ${fmtDate(d.installment.next_due)}` : ""}`}
        crumbs={[{ label: "Installments", href: "/installments" }]}
        info={`${MONEY.received.label} = money that went to this installment, whenever it was paid. ${left} = what is not paid yet (${isDue ? "its due date has passed" : "its due date has not come yet"}).`}
        actions={
          <div className="inline-flex max-w-full overflow-x-auto rounded-[10px] bg-fill p-[2px]">
            {siblings.map((x) => (
              <Link
                key={x.number}
                href={`/installments/${x.number}`}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-[8px] px-3 py-[5px] text-footnote font-medium",
                  x.number === d.installment.number ? "bg-surface text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:bg-surface-3" : "text-ink-2 hover:text-ink",
                )}
              >
                {x.name}
              </Link>
            ))}
          </div>
        }
      />

      <section className="rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <Ring value={s.collection_pct} size={176} stroke={17} className="self-center">
            <span className="figure text-[34px] leading-none">{Math.round(s.collection_pct ?? 0)}%</span>
            <span className="mt-1 text-footnote text-ink-2">received</span>
          </Ring>
          <div className="grid flex-1 grid-cols-2 gap-6 lg:grid-cols-4">
            <div>
              <p className="text-footnote text-ink-2">{MONEY.total_fee.label}</p>
              <p className="figure mt-1 text-title1">{rupeesShort(s.expected)}</p>
              <p className="text-caption text-muted">{s.students} students</p>
            </div>
            <div>
              <p className="text-footnote text-ink-2">{MONEY.received.label}</p>
              <p className="figure mt-1 text-title1">{rupeesShort(s.received)}</p>
              <p className="text-caption text-muted">{pct(s.on_time_pct, 0)} received on time</p>
            </div>
            <div>
              <p className="text-footnote text-ink-2">{left}</p>
              <p className={cn("figure mt-1 text-title1", s.gap > 0 && isDue ? "text-critical-ink" : "text-ink")}>{rupeesShort(s.gap)}</p>
              <p className="text-caption text-muted">{isDue ? "due date has passed" : `due ${fmtDate(d.installment.due_date)}`}</p>
            </div>
            <div>
              <p className="text-footnote text-ink-2">Received late, after next due date</p>
              <p className="figure mt-1 text-title1">{rupeesShort(d.catch_up.amount)}</p>
              <p className="text-caption text-muted">{d.catch_up.next_due ? "delayed, not lost" : "last installment"}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {d.groups.map((g) => (
          <div key={g.group} className="rounded-[var(--radius-card)] bg-surface p-5 shadow-card">
            <p className="flex items-center gap-2 text-footnote font-medium text-ink-2">
              <span className={cn("size-2.5 rounded-full", GROUPS[g.group].dot)} aria-hidden />
              {GROUPS[g.group].label}
            </p>
            <p className="figure mt-2 text-title1 text-ink">{g.students}</p>
            <p className={cn("mt-1 text-footnote tabular", g.missing > 0 ? GROUPS[g.group].text : "text-muted")}>
              {g.missing > 0 ? `${rupeesShort(g.missing)} ${left.toLowerCase()}` : "fully received"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5">
          <Card title={`${left} by class`} description={`Unpaid amount of this installment per class, with each class's share of it.`}>
            <BarList
              compact
              color="bg-critical"
              rows={[...d.classes]
                .filter((c) => c.gap > 0)
                .sort((a, b) => b.gap - a.gap)
                .map((c) => ({
                  label: c.class_name,
                  value: c.gap,
                  display: rupeesShort(c.gap),
                  sub: pct(c.share_of_gap, 0),
                  href: c.class_id ? `/classes/${c.class_id}` : undefined,
                }))}
            />
          </Card>
          <Card title="When it was received" description="Payments for this installment compared with its due date.">
            <StackedBar
              height="h-3"
              segments={d.timing.map((t, i) => ({ value: t.amount, className: TIMING_COLOR[i % 4], label: TIMING_LABEL[t.bucket], display: rupees(t.amount) }))}
            />
            <ul className="mt-4 space-y-2">
              {d.timing.map((t, i) => (
                <li key={t.bucket} className="flex items-center justify-between text-subhead">
                  <span className="flex items-center gap-2 text-ink">
                    <span className={cn("size-2.5 rounded-full", TIMING_COLOR[i % 4])} aria-hidden />
                    {TIMING_LABEL[t.bucket]}
                  </span>
                  <span className="tabular">
                    <span className="font-semibold">{rupeesShort(t.amount)}</span>
                    <span className="ml-1.5 text-footnote text-muted">{pct(ratioPct(t.amount, timingTotal), 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card
          className="xl:col-span-2"
          title={list === "all" ? `Everyone with ${left.toLowerCase()}` : "Call these first"}
          subtitle={
            list === "all"
              ? `${rows.length} students · ${rupeesShort(s.gap)} ${left.toLowerCase()}`
              : topHalf.length > 0
                ? `${topHalf.length} students hold ${rupeesShort(topHalfGap)}, half of what is ${left.toLowerCase()}`
                : undefined
          }
          description={`“Call these first” is the smallest set of students who together hold half of what is ${left.toLowerCase()} for this installment. Recovering from them first brings in the most, fastest.`}
          actions={
            <Segmented
              size="sm"
              options={[
                { label: `Call first · ${topHalf.length}`, href: `/installments/${d.installment.number}`, active: list !== "all" },
                { label: `Everyone · ${rows.length}`, href: `/installments/${d.installment.number}?list=all`, active: list === "all" },
              ]}
            />
          }
        >
          <DataTable
            key={list}
            rows={(list === "all" ? rows : rows.filter((x) => x.in_top_half)) as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "phone", "class_name"]}
            filters={
              list === "all"
                ? [
                    { key: "class_name", label: "Class", options: d.classes.map((c) => ({ value: c.class_name, label: c.class_name })) },
                    {
                      key: "group",
                      label: "Group",
                      options: [
                        { value: "over_half", label: GROUPS.over_half.label },
                        { value: "under_half", label: GROUPS.under_half.label },
                        { value: "nothing", label: GROUPS.nothing.label },
                      ],
                    },
                  ]
                : []
            }
            totals
            pageSize={15}
            exportName={`inst-${d.installment.number}-${list === "all" ? "unpaid" : "call-list"}`}
            exportMeta={[
              `${d.installment.name} · ${session.name}`,
              list === "all" ? `Students with ${left.toLowerCase()}` : `Smallest set of students holding 50% of what is ${left.toLowerCase()}`,
            ]}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
              { key: "phone", label: "Phone", hideOnMobile: true },
              { key: "received", label: MONEY.received.label, type: "money", total: true, dimZero: true, hideOnMobile: true },
              { key: "gap", label: left, type: "money", total: true, alertPositive: true },
            ]}
            defaultSort={{ key: "gap", dir: "desc" }}
            empty="Nothing is left to pay for this installment."
          />
        </Card>
      </div>
    </div>
  );
}
