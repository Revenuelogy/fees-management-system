"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { flag, param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/ui/page-state";
import { MONEY } from "@/lib/glossary";
import { MODE_LABELS, addMonths, fmtDate, fmtDateTime, monthLabel, monthsBetween, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import type { MonthPayment, MonthSummary, NonPayer } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { BarList, Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { KIND_LEGEND } from "@/components/ui/alloc";
import { Ring } from "@/components/ui/ring";
import { DailyCollectionChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";
import { MonthPicker } from "./month-picker";

export function MonthlyView({ sp }: { sp: SearchParams }) {
  const { session, sessions } = useApp();
  const today = todayIST().slice(0, 7);
  const sessionMonths = session ? monthsBetween(session.start_date, session.end_date) : [today];
  const requested = param(sp.month);
  const month =
    requested && /^\d{4}-\d{2}$/.test(requested)
      ? requested
      : sessionMonths.includes(today)
        ? today
        : today > sessionMonths[sessionMonths.length - 1]
          ? sessionMonths[sessionMonths.length - 1]
          : sessionMonths[0];
  const carry = flag(sp.carry, true);
  const view = param(sp.view) === "unpaid" ? "unpaid" : "paid";

  const sumRes = useApi<MonthSummary>(session ? apiUrl(`/api/analytics/months/${month}`, { carry }) : null);
  const payRes = useApi<MonthPayment[]>(session ? `/api/analytics/months/${month}/payments` : null);
  const nonRes = useApi<NonPayer[]>(session ? apiUrl(`/api/analytics/months/${month}/non-payers`, { carry }) : null);
  if (!session) return <NoSession />;

  const url = (extra: Record<string, string | number | boolean | undefined>) =>
    withParams("/monthly", { month, carry: carry ? undefined : false, view: view === "unpaid" ? "unpaid" : undefined, ...extra });

  const allMonths = sessions
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .flatMap((s) => monthsBetween(s.start_date, s.end_date).map((m) => ({ value: m, label: monthLabel(m) })));

  const stepper = (
    <div className="flex items-center gap-1.5">
      <Link href={url({ month: addMonths(month, -1) })} className="inline-flex size-9 items-center justify-center rounded-full bg-fill text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]" aria-label="Previous month">
        <ChevronLeft className="size-4" />
      </Link>
      <MonthPicker months={allMonths} value={month} hrefTemplate={url({ month: "__M__" })} />
      <Link href={url({ month: addMonths(month, 1) })} className="inline-flex size-9 items-center justify-center rounded-full bg-fill text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]" aria-label="Next month">
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );

  if (sumRes.error && !sumRes.data) {
    return (
      <>
        <PageHeader title={monthLabel(month)} actions={stepper} />
        <Card>
          <p className="text-subhead text-ink-2">{sumRes.error.message || "No data for this month."}</p>
        </Card>
      </>
    );
  }
  // the student lists are secondary: show the month even if one of them failed
  const settled = (q: { data?: unknown; error?: unknown }) => q.data !== undefined || q.error !== undefined;
  if (!sumRes.data || !settled(payRes) || !settled(nonRes)) return <PageSkeleton />;

  const m = sumRes.data as MonthSummary;
  const live = m.summary;
  const snap = m.closed?.snapshot ?? null;
  const s = snap?.summary ?? live;
  const classes = snap?.classes ?? m.classes;
  const modes = snap?.modes ?? m.modes;
  const payments = payRes.data ?? [];
  const nonPayers = nonRes.data ?? [];
  const isCurrent = m.status === "current";
  const modesTotal = modes.reduce((a, x) => a + x.amount, 0);
  const pctCollected = s.collection_pct ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={m.label}
        description={
          <>
            {m.session.name} · {isCurrent ? `${s.days_left} days left` : m.status === "past" ? "Month ended" : "Not started yet"}
            {m.closed && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-ink-2" title={`Frozen ${fmtDateTime(m.closed.closed_at)}`}>
                <Lock className="size-3" /> Closed
              </span>
            )}
          </>
        }
        info={`Fees due = what was still unpaid on the 1st for this year's installments due this month (with "All fees due so far", also earlier unpaid installments). Received this month = every rupee that came in during the month, split into this year, ${MONEY.old_balance.label.toLowerCase()} and ${MONEY.advance.label.toLowerCase()}.`}
        actions={stepper}
      >
        <Segmented
          options={[
            { label: "Due this month", href: url({ carry: false }), active: !carry },
            { label: "All fees due so far", href: url({ carry: undefined }), active: carry },
          ]}
        />
      </PageHeader>

      {m.closed && snap && live.received !== snap.summary.received && (
        <p className="rounded-2xl bg-fill-2 px-4 py-3 text-footnote text-ink-2">
          Frozen figures shown. Live received differs by {rupees(live.received - snap.summary.received, { sign: true })}.
        </p>
      )}

      <section className="animate-rise rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-subhead font-medium text-ink-2">Received this month</p>
            <p className="figure mt-1 text-[44px] leading-none text-ink sm:text-display">{rupeesShort(s.received)}</p>
            <p className="mt-2 text-body text-ink-2">
              against <span className="font-semibold text-ink">{rupeesShort(s.expected)}</span> fees due · {s.payments_count} receipts
            </p>
            <div className="mt-6 max-w-xl">
              <StackedBar
                height="h-3"
                segments={[
                  { value: s.received_current, className: "bg-series-1", label: "This year", display: rupees(s.received_current) },
                  { value: s.received_arrears, className: "bg-series-2", label: MONEY.old_balance.label, display: rupees(s.received_arrears) },
                  { value: s.received_advance, className: "bg-series-3", label: MONEY.advance.label, display: rupees(s.received_advance) },
                ]}
              />
              <Legend
                className="mt-3"
                items={[
                  { ...KIND_LEGEND[0], value: rupeesShort(s.received_current) },
                  { ...KIND_LEGEND[1], value: rupeesShort(s.received_arrears) },
                  { ...KIND_LEGEND[2], value: rupeesShort(s.received_advance) },
                ]}
              />
            </div>
          </div>
          <Ring value={pctCollected} size={176} stroke={17} className="self-center" label={`${pct(pctCollected, 0)} of fees due received`}>
            <span className="figure text-[34px] leading-none">{Math.round(pctCollected)}%</span>
            <span className="mt-1 text-footnote text-ink-2">of fees due</span>
          </Ring>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 border-t border-line pt-6 sm:grid-cols-3">
          <div>
            <p className="text-footnote text-ink-2">{m.status === "past" ? "Not received in the month" : MONEY.due_now.label}</p>
            <p className={`mt-0.5 text-title2 font-semibold tabular ${s.still_to_come > 0 && m.status === "past" ? "text-critical-ink" : "text-ink"}`}>{rupeesShort(s.still_to_come)}</p>
          </div>
          <Link href={url({ view: undefined }) + "#students"} className="group">
            <p className="text-footnote text-ink-2">Students who paid</p>
            <p className="mt-0.5 text-title2 font-semibold tabular text-good-ink group-hover:underline">{s.students_paid}</p>
            <p className="text-caption text-muted">{s.students_cleared} fully cleared</p>
          </Link>
          <Link href={url({ view: "unpaid" }) + "#students"} className="group">
            <p className="text-footnote text-ink-2">Owe fees, paid nothing this month</p>
            <p className="mt-0.5 text-title2 font-semibold tabular text-critical-ink group-hover:underline">{s.students_expected_not_paid}</p>
            <p className="text-caption text-muted">of {s.students_expected} with fees due</p>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Day by day" description="Money received per day, net of cancellations. Switch to running total to compare with the fees due this month.">
          <DailyCollectionChart data={m.daily} target={s.expected} />
        </Card>
        <Card title="Payment modes">
          {modes.length === 0 ? (
            <p className="py-8 text-center text-subhead text-ink-2">No payments.</p>
          ) : (
            <BarList
              compact
              rows={modes.map((x) => ({
                label: MODE_LABELS[x.mode] ?? x.mode,
                value: x.amount,
                display: rupeesShort(x.amount),
                sub: pct(ratioPct(x.amount, modesTotal), 0),
              }))}
            />
          )}
        </Card>
      </div>

      <Card title="Classes" description="Received this month and progress against each class's own fees due. Open a class to see every student.">
        <ul className="-mx-2 divide-y divide-line">
          {classes.map((c) => (
            <li key={c.class_id ?? "none"}>
              <Link
                href={withParams(`/monthly/${month}/${c.class_id ?? "none"}`, { carry: carry ? undefined : false })}
                className="group grid grid-cols-[minmax(90px,1fr)_minmax(120px,2fr)_auto] items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-fill-2 sm:grid-cols-[160px_1fr_110px_90px]"
              >
                <span className="truncate text-subhead font-medium text-ink group-hover:text-accent">{c.class_name}</span>
                <span className="flex items-center gap-3">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill-2">
                    <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.min(100, c.collection_pct ?? 0)}%` }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-footnote tabular text-ink-2" title={`${rupeesShort(c.collected)} received of ${rupeesShort(c.expected)} due`}>
                    <b className="font-semibold text-ink">{pct(c.collection_pct, 0)}</b> of {rupeesShort(c.expected)}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-subhead font-semibold tabular text-ink">{rupeesShort(c.received)}</span>
                  <span className="block text-caption tabular text-muted">{pct(c.share, 0)} of month</span>
                </span>
                <span className="hidden text-right text-caption tabular sm:block">
                  <span className="text-good-ink">{c.students_paid} paid</span>
                  <br />
                  <span className={c.students_not_paid > 0 ? "text-critical-ink" : "text-muted"}>{c.students_not_paid} not</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        id="students"
        title={view === "paid" ? "Paid this month" : "Owe fees, paid nothing this month"}
        actions={
          <Segmented
            size="sm"
            options={[
              { label: `Paid · ${payments.filter((p) => !p.is_reversal).length}`, href: url({ view: undefined }) + "#students", active: view === "paid" },
              { label: `Not paid · ${nonPayers.length}`, href: url({ view: "unpaid" }) + "#students", active: view === "unpaid" },
            ]}
          />
        }
      >
        {view === "paid" ? (
          <DataTable
            rows={payments.map((p) => ({ ...p, class_label: p.class_name ? `${p.class_name}${p.section ? " · " + p.section : ""}` : "Left" })) as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "receipt_no", "father_name", "class_name"]}
            filters={[
              { key: "class_name", label: "Class", options: [...new Set(payments.map((p) => p.class_name).filter(Boolean))].map((c) => ({ value: c as string, label: c as string })) },
              { key: "mode", label: "Mode", options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })) },
            ]}
            totals
            pageSize={25}
            exportName={`month-${month}-payments`}
            exportMeta={[`Month ${m.label}`, "Payments received"]}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "class_label" },
              { key: "amount", label: "Amount", type: "money", total: true },
              { key: "allocations", label: "Paid for", type: "alloc" },
              { key: "paid_on", label: "Date", type: "date", hideOnMobile: true },
              { key: "receipt_no", label: "Receipt", href: "/payments/{payment_id}", hideOnMobile: true },
            ]}
            empty="No payments in this month."
          />
        ) : (
          <DataTable
            rows={nonPayers.map((p) => ({ ...p, class_label: `${p.class_name}${p.section ? " · " + p.section : ""}` })) as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "father_name", "phone", "class_name"]}
            filters={[{ key: "class_name", label: "Class", options: [...new Set(nonPayers.map((p) => p.class_name))].map((c) => ({ value: c, label: c })) }]}
            totals
            pageSize={25}
            exportName={`month-${month}-not-paid`}
            exportMeta={[`Month ${m.label}`, "Owe fees, paid nothing this month", carry ? "All fees due so far" : "Fees due this month"]}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "class_label" },
              { key: "phone", label: "Phone", hideOnMobile: true },
              { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
              { key: "owed", label: carry ? MONEY.due_now.label : "Due this month", type: "money", total: true, alertPositive: true },
            ]}
            defaultSort={{ key: "owed", dir: "desc" }}
            empty="Everyone with fees due paid something."
          />
        )}
      </Card>

      <p className="text-center text-caption text-muted">Fees due are measured on {fmtDate(m.start)}.</p>
    </div>
  );
}
