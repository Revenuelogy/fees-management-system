import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession, getSessions, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
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

export const metadata = { title: "Months" };

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

  if (sumRes.error || !sumRes.data) {
    return (
      <>
        <PageHeader title={monthLabel(month)} actions={stepper} />
        <Card>
          <p className="text-subhead text-ink-2">{sumRes.error?.message ?? "No data for this month."}</p>
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
  const modesTotal = modes.reduce((a, x) => a + x.amount, 0);
  const pctCollected = s.collection_pct ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={m.label}
        description={
          <>
            {m.session.name} · {isCurrent ? `${s.days_left} days left` : m.status === "past" ? "Month ended" : "Upcoming"}
            {m.closed && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-caption font-semibold text-ink-2" title={`Frozen ${fmtDateTime(m.closed.closed_at)}`}>
                <Lock className="size-3" /> Closed
              </span>
            )}
          </>
        }
        info="Expected = what was still unpaid on the 1st for installments due this month (plus earlier unpaid installments and old dues if switched on). Collected = every rupee received during the month."
        actions={stepper}
      >
        <Segmented
          options={[
            { label: "Due this month", href: url({ carry: false }), active: !carry },
            { label: "All dues so far", href: url({ carry: undefined }), active: carry },
          ]}
        />
        <Segmented
          options={[
            { label: "This session", href: url({ arrears: undefined }), active: !arrears },
            { label: "Including old dues", href: url({ arrears: true }), active: arrears },
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
            <p className="text-subhead font-medium text-ink-2">{isCurrent ? "Collected so far" : "Collected"}</p>
            <p className="figure mt-1 text-[44px] leading-none text-ink sm:text-display">{rupeesShort(s.received)}</p>
            <p className="mt-2 text-body text-ink-2">
              against <span className="font-semibold text-ink">{rupeesShort(s.expected)}</span> expected · {s.payments_count} receipts
            </p>
            <div className="mt-6 max-w-xl">
              <StackedBar
                height="h-3"
                segments={[
                  { value: s.received_current, className: "bg-series-1", label: "This year", display: rupees(s.received_current) },
                  { value: s.received_arrears, className: "bg-series-2", label: "Old dues", display: rupees(s.received_arrears) },
                  { value: s.received_advance, className: "bg-series-3", label: "Advance", display: rupees(s.received_advance) },
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
          <Ring value={pctCollected} size={176} stroke={17} className="self-center" label={`${pct(pctCollected, 0)} of expected collected`}>
            <span className="figure text-[34px] leading-none">{Math.round(pctCollected)}%</span>
            <span className="mt-1 text-footnote text-ink-2">of expected</span>
          </Ring>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-3 border-t border-line pt-6 sm:grid-cols-3">
          <div>
            <p className="text-footnote text-ink-2">{isCurrent ? "Still to come" : "Not collected"}</p>
            <p className={`mt-0.5 text-title2 font-semibold tabular ${s.still_to_come > 0 && m.status === "past" ? "text-critical-ink" : "text-ink"}`}>{rupeesShort(s.still_to_come)}</p>
            {isCurrent && s.run_rate_needed ? <p className="text-caption text-muted">{rupeesShort(s.run_rate_needed)} a day needed</p> : null}
          </div>
          <Link href={url({ view: undefined }) + "#students"} className="group">
            <p className="text-footnote text-ink-2">Students who paid</p>
            <p className="mt-0.5 text-title2 font-semibold tabular text-good-ink group-hover:underline">{s.students_paid}</p>
            <p className="text-caption text-muted">{s.students_cleared} fully cleared</p>
          </Link>
          <Link href={url({ view: "unpaid" }) + "#students"} className="group">
            <p className="text-footnote text-ink-2">Owed but paid nothing</p>
            <p className="mt-0.5 text-title2 font-semibold tabular text-critical-ink group-hover:underline">{s.students_expected_not_paid}</p>
            <p className="text-caption text-muted">of {s.students_expected} who owed money</p>
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Day by day" description="Money received per day, net of cancellations. Switch to running total to compare with what was expected.">
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

      <Card title="Classes" description="Collected this month and progress against each class's own expected amount. Open a class to see every student.">
        <ul className="-mx-2 divide-y divide-line">
          {classes.map((c) => (
            <li key={c.class_id ?? "none"}>
              <Link
                href={withParams(`/monthly/${month}/${c.class_id ?? "none"}`, { carry: carry ? undefined : false, arrears: arrears || undefined })}
                className="group grid grid-cols-[minmax(90px,1fr)_minmax(120px,2fr)_auto] items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-fill-2 sm:grid-cols-[160px_1fr_110px_90px]"
              >
                <span className="truncate text-subhead font-medium text-ink group-hover:text-accent">{c.class_name}</span>
                <span className="flex items-center gap-3">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-fill-2">
                    <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.min(100, c.collection_pct ?? 0)}%` }} />
                  </span>
                  <span className="w-10 text-right text-footnote tabular text-ink-2">{pct(c.collection_pct, 0)}</span>
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
        title={view === "paid" ? "Paid this month" : "Owed but paid nothing"}
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
            exportMeta={[`Month ${m.label}`, "Expected to pay but paid nothing"]}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "class_label" },
              { key: "phone", label: "Phone", hideOnMobile: true },
              { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
              { key: "owed", label: "Owed", type: "money", total: true, alertPositive: true },
            ]}
            defaultSort={{ key: "owed", dir: "desc" }}
            empty="Everyone who owed money paid something."
          />
        )}
      </Card>

      <p className="text-center text-caption text-muted">Expected is measured on {fmtDate(m.start)}.</p>
    </div>
  );
}
