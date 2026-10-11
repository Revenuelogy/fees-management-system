import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession, getSessions, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, addMonths, fmtDate, fmtDateTime, monthLabel, monthsBetween, num, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import type { MonthPayment, MonthSummary, NonPayer } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { BarList, Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { KIND_LEGEND } from "@/components/ui/alloc";
import { CumulativeChart, DailyCollectionChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";
import { MonthPicker } from "./month-picker";

export const metadata = { title: "Monthly analysis" };

export default async function MonthlyPage({ searchParams }: PageProps<"/monthly">) {
  await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const sessions = await getSessions();

  const today = todayIST().slice(0, 7);
  const sessionMonths = monthsBetween(session.start_date, session.end_date);
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
  const arrears = flag(sp.arrears, false);
  const view = param(sp.view) === "unpaid" ? "unpaid" : "paid";

  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const [sumRes, payRes, nonRes] = await Promise.all([
    supabase.rpc("month_summary", { p_month: monthDate, p_carry: carry, p_arrears: arrears }),
    supabase.rpc("month_payments", { p_month: monthDate }),
    supabase.rpc("month_non_payers", { p_month: monthDate, p_carry: carry, p_arrears: arrears }),
  ]);

  const url = (extra: Record<string, string | number | boolean | undefined>) =>
    withParams("/monthly", { month, carry: carry ? undefined : false, arrears: arrears || undefined, view: view === "unpaid" ? "unpaid" : undefined, ...extra });

  // all months across all sessions for the picker
  const allMonths = sessions
    .slice()
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .flatMap((s) => monthsBetween(s.start_date, s.end_date).map((m) => ({ value: m, label: `${monthLabel(m)} (${s.name})` })));

  if (sumRes.error || !sumRes.data) {
    return (
      <>
        <PageHeader title="Monthly analysis" crumbs={[{ label: session.name, href: "/" }, { label: "Monthly" }]} />
        <Card>
          <p className="text-sm text-ink-2">{sumRes.error?.message ?? "No data for this month."}</p>
          <div className="mt-3">
            <MonthPicker months={allMonths} value={month} hrefTemplate={url({ month: "__M__" })} />
          </div>
        </Card>
      </>
    );
  }

  const m = sumRes.data as MonthSummary;
  const live = m.summary;
  const snap = m.closed?.snapshot ?? null;
  const s = snap?.summary ?? live;
  const classes = snap?.classes ?? m.classes;
  const modes = snap?.modes ?? m.modes;
  const payments = (payRes.data ?? []) as MonthPayment[];
  const nonPayers = (nonRes.data ?? []) as NonPayer[];
  const isCurrent = m.status === "current";
  const receivedLabel = isCurrent ? "Received month-to-date" : m.status === "upcoming" ? "Received" : "Received in month";
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const modesTotal = modes.reduce((a, x) => a + x.amount, 0);

  return (
    <>
      <PageHeader
        title={m.label}
        description={
          <>
            Session {m.session.name} ·{" "}
            {isCurrent ? `day ${s.days_elapsed} of ${s.days_in_month}, ${s.days_left} days left` : m.status === "past" ? "month closed in calendar" : "upcoming month"}
          </>
        }
        crumbs={[{ label: m.session.name, href: "/" }, { label: "Monthly", href: "/monthly" }, { label: m.label }]}
        actions={
          <div className="flex items-center gap-1">
            <Link href={url({ month: prev })} className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface hover:bg-surface-2" aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Link>
            <MonthPicker months={allMonths} value={month} hrefTemplate={url({ month: "__M__" })} />
            <Link href={url({ month: next })} className="inline-flex size-9 items-center justify-center rounded-lg border border-line-strong bg-surface hover:bg-surface-2" aria-label="Next month">
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      >
        <Segmented
          label="Expected"
          options={[
            { label: "Due this month only", href: url({ carry: false }), active: !carry, title: "Only installments whose due date falls in this month" },
            { label: "+ carry-over", href: url({ carry: undefined }), active: carry, title: "Also unpaid installments that fell due earlier in the session" },
          ]}
        />
        <Segmented
          options={[
            { label: "Current session", href: url({ arrears: undefined }), active: !arrears },
            { label: "+ previous dues", href: url({ arrears: true }), active: arrears, title: "Also unpaid fees from earlier sessions" },
          ]}
        />
      </PageHeader>

      {m.closed && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[13px] text-ink-2">
          <Lock className="size-4 text-ink" aria-hidden />
          <span>
            <b className="text-ink">Closed month.</b> Figures are frozen as of {fmtDateTime(m.closed.closed_at)}.
            {snap && live.received !== snap.summary.received && (
              <> Live received now differs by {rupees(live.received - snap.summary.received, { sign: true })}; corrections show as adjustments in the month they were made.</>
            )}
          </span>
        </div>
      )}

      <KpiGrid cols={5}>
        <Kpi
          label="Expected this month"
          value={rupeesShort(s.expected)}
          sub={
            <>
              {rupeesShort(s.due_in_month)} falls due
              {s.prepaid > 0 && <> (−{rupeesShort(s.prepaid)} prepaid)</>}
              {carry && <> · {rupeesShort(s.carry_over)} carry-over</>}
              {arrears && <> · {rupeesShort(s.arrears_outstanding)} previous dues</>}
            </>
          }
        />
        <Kpi
          label={receivedLabel}
          value={rupeesShort(s.received)}
          meter={s.collection_pct}
          sub={
            <>
              {rupeesShort(s.collected_against_target)} against this month&apos;s target ({pct(s.collection_pct)}) · {num(s.payments_count)} receipts
              {s.reversals < 0 && <> · {rupeesShort(s.reversals)} cancelled</>}
            </>
          }
        />
        <Kpi
          label={isCurrent ? "Still to come this month" : "Not collected"}
          value={rupeesShort(s.still_to_come)}
          tone={s.still_to_come > 0 && m.status === "past" ? "critical" : "default"}
          sub={
            isCurrent && s.run_rate_needed ? (
              <>Needs {rupeesShort(s.run_rate_needed)} a day for the remaining {s.days_left} days</>
            ) : (
              <>{pct(ratioPct(s.still_to_come, s.expected))} of expected</>
            )
          }
        />
        <Kpi
          label="Students who paid"
          value={num(s.students_paid)}
          href={url({ view: undefined }) + "#students"}
          sub={
            <>
              {num(s.students_expected_paid)} of {num(s.students_expected)} expected to pay · {num(s.students_cleared)} fully cleared
            </>
          }
        />
        <Kpi
          label="Expected but not paid"
          value={num(s.students_expected_not_paid)}
          tone={s.students_expected_not_paid > 0 ? "critical" : "good"}
          href={url({ view: "unpaid" }) + "#students"}
          sub={<>{pct(ratioPct(s.students_expected_not_paid, s.students_expected), 0)} of students who owed money this month</>}
        />
      </KpiGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" title="What the money paid for" description="Money received this month, split by the dues it cleared.">
          <StackedBar
            height="h-4"
            segments={[
              { value: s.received_current, className: "bg-series-1", label: "Current year fees", display: rupees(s.received_current) },
              { value: s.received_arrears, className: "bg-series-2", label: "Previous dues", display: rupees(s.received_arrears) },
              { value: s.received_advance, className: "bg-series-3", label: "Advance", display: rupees(s.received_advance) },
            ]}
          />
          <div className="mt-3">
            <Legend items={KIND_LEGEND} />
          </div>
          <dl className="mt-3 space-y-1 text-[13px]">
            {[
              ["Current year fees", s.received_current],
              ["Previous dues (arrears recovery)", s.received_arrears],
              ["Advance / next session", s.received_advance],
            ].map(([label, v]) => (
              <div key={label as string} className="flex justify-between gap-2">
                <dt className="text-ink-2">{label}</dt>
                <dd className="font-medium tabular text-ink">
                  {rupees(v as number)} <span className="text-muted">· {pct(ratioPct(v as number, s.received), 0)}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card className="lg:col-span-2" title="Daily collection" description="Money received per day (net of cancellations).">
          <DailyCollectionChart data={m.daily} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Cumulative against expected" description="Running total for the month against what was expected to come in.">
          <CumulativeChart data={m.daily} target={s.expected} />
        </Card>
        <Card title="Payment modes">
          {modes.length === 0 ? (
            <p className="text-sm text-ink-2">No payments.</p>
          ) : (
            <BarList
              labelWidth="w-24"
              rows={modes.map((x) => ({
                label: MODE_LABELS[x.mode] ?? x.mode,
                value: x.amount,
                display: rupeesShort(x.amount),
                sub: `${pct(ratioPct(x.amount, modesTotal), 0)} · ${x.count}`,
              }))}
            />
          )}
          {m.heads.length > 0 && (
            <>
              <h3 className="mb-2 mt-5 text-[13px] font-semibold text-ink">By fee head</h3>
              <BarList
                labelWidth="w-28"
                rows={m.heads.map((h) => ({ label: h.fee_head, value: h.amount, display: rupeesShort(h.amount) }))}
              />
            </>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Class contribution"
        description="Which class brought how much this month, and how each did against its own expected amount. Open a class to see every student."
      >
        <DataTable
          rows={classes.map((c) => ({ ...c, key: c.class_id ?? "none", link_id: c.class_id ?? "none" })) as unknown as Record<string, unknown>[]}
          totals
          pageSize={100}
          exportName={`month-${month}-classes`}
          exportMeta={[`Month ${m.label}`, `Session ${m.session.name}`, carry ? "Expected includes carry-over" : "Expected = due this month only", arrears ? "Including previous dues" : "Current session only"]}
          columns={[
            { key: "class_name", label: "Class", href: withParams(`/monthly/${month}/{link_id}`, { carry: carry ? undefined : false, arrears: arrears || undefined }) },
            { key: "received", label: "Received", type: "money", total: true },
            { key: "share", label: "Share", type: "pct" },
            { key: "current", label: "Current yr", type: "money", total: true, hideOnMobile: true, dimZero: true },
            { key: "arrears", label: "Prev. dues", type: "money", total: true, hideOnMobile: true, dimZero: true },
            { key: "expected", label: "Expected", type: "money", total: true },
            { key: "collected", label: "Collected vs exp.", type: "money", total: true, hideOnMobile: true },
            { key: "still_to_come", label: "Still to come", type: "money", total: true, alertPositive: m.status === "past" },
            { key: "collection_pct", label: "Coll. %", type: "pct" },
            { key: "students_paid", label: "Paid", type: "number", total: true },
            { key: "students_not_paid", label: "Not paid", type: "number", total: true, alertPositive: true },
          ]}
        />
      </Card>

      <Card
        id="students"
        className="mt-4"
        title={view === "paid" ? `Students who paid in ${m.label}` : `Expected to pay in ${m.label} but paid nothing`}
        actions={
          <Segmented
            options={[
              { label: `Paid (${payments.filter((p) => !p.is_reversal).length} receipts)`, href: url({ view: undefined }) + "#students", active: view === "paid" },
              { label: `Not paid (${nonPayers.length})`, href: url({ view: "unpaid" }) + "#students", active: view === "unpaid" },
            ]}
          />
        }
      >
        {view === "paid" ? (
          <DataTable
            rows={payments as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "receipt_no", "father_name", "class_name"]}
            filters={[
              { key: "class_name", label: "Class", options: [...new Set(payments.map((p) => p.class_name).filter(Boolean))].map((c) => ({ value: c as string, label: c as string })) },
              { key: "mode", label: "Mode", options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })) },
            ]}
            totals
            exportName={`month-${month}-payments`}
            exportMeta={[`Month ${m.label}`, "Payments received"]}
            columns={[
              { key: "paid_on", label: "Date", type: "date" },
              { key: "receipt_no", label: "Receipt", href: "/payments/{payment_id}" },
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: "amount", label: "Amount", type: "money", total: true },
              { key: "mode", label: "Mode", type: "mode", hideOnMobile: true },
              { key: "allocations", label: "Paid for", type: "alloc" },
            ]}
            empty="No payments in this month."
          />
        ) : (
          <DataTable
            rows={nonPayers as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "father_name", "phone", "class_name"]}
            filters={[{ key: "class_name", label: "Class", options: [...new Set(nonPayers.map((p) => p.class_name))].map((c) => ({ value: c, label: c })) }]}
            totals
            exportName={`month-${month}-not-paid`}
            exportMeta={[`Month ${m.label}`, "Expected to pay but paid nothing", carry ? "Includes carry-over" : "Due this month only", arrears ? "Including previous dues" : "Current session only"]}
            columns={[
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: "father_name", label: "Father", hideOnMobile: true },
              { key: "phone", label: "Phone" },
              { key: "owed", label: "Owed this month", type: "money", total: true, alertPositive: true },
              { key: "last_paid_on", label: "Last paid", type: "date" },
            ]}
            defaultSort={{ key: "owed", dir: "desc" }}
            empty="Everyone who owed money paid something."
          />
        )}
      </Card>

      <p className="mt-4 text-[12.5px] text-muted">
        Expected = what was still unpaid on {fmtDate(m.start)} for installments due this month
        {carry ? " plus earlier unpaid installments of the session" : ""}
        {arrears ? " plus earlier sessions' dues" : ""}. Received = every rupee that came in during the month, whatever it paid for.
      </p>
    </>
  );
}
