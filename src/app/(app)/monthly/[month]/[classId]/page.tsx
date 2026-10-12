import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { flag, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addMonths, monthLabel, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { MonthClassDetail, MonthPayment } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { KIND_LEGEND } from "@/components/ui/alloc";
import { Ring } from "@/components/ui/ring";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Class in month" };

const pill = "inline-flex h-9 items-center gap-1 rounded-full bg-fill px-3.5 text-subhead font-medium text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)]";

export default async function MonthClassPage({ params, searchParams }: PageProps<"/monthly/[month]/[classId]">) {
  await requireStaff();
  const { month, classId } = await params;
  const sp = await searchParams;
  if (!/^\d{4}-\d{2}$/.test(month)) notFound();
  const carry = flag(sp.carry, true);
  const arrears = flag(sp.arrears, false);
  const show = param(sp.show) ?? "all";
  const supabase = await createClient();
  const monthDate = `${month}-01`;
  const qs = { carry: carry ? undefined : false, arrears: arrears || undefined };

  if (classId === "none") {
    const { data } = await supabase.rpc("month_payments", { p_month: monthDate, p_unassigned: true });
    const payments = (data ?? []) as MonthPayment[];
    return (
      <div className="space-y-5">
        <PageHeader
          title="Left or not enrolled"
          description={`${monthLabel(month)} · payments from students no longer enrolled`}
          crumbs={[{ label: "Months", href: withParams("/monthly", { month, ...qs }) }, { label: monthLabel(month), href: withParams("/monthly", { month, ...qs }) }]}
        />
        <Card>
          <DataTable
            rows={payments as unknown as Record<string, unknown>[]}
            totals
            exportName={`month-${month}-not-enrolled`}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "admission_no" },
              { key: "amount", label: "Amount", type: "money", total: true },
              { key: "allocations", label: "Paid for", type: "alloc" },
              { key: "paid_on", label: "Date", type: "date" },
            ]}
          />
        </Card>
      </div>
    );
  }

  const { data, error } = await supabase.rpc("month_class_detail", { p_month: monthDate, p_class: classId, p_carry: carry, p_arrears: arrears });
  if (error || !data) throw new Error(error?.message ?? "Could not load the class");
  const d = data as MonthClassDetail;
  if (!d.class?.id) notFound();

  const rows = d.students;
  const paid = rows.reduce((a, r) => a + r.paid, 0);
  const cur = rows.reduce((a, r) => a + r.paid_current, 0);
  const arr = rows.reduce((a, r) => a + r.paid_arrears, 0);
  const adv = rows.reduce((a, r) => a + r.paid_advance, 0);
  const target = rows.reduce((a, r) => a + r.target, 0);
  const remaining = rows.reduce((a, r) => a + r.target_remaining, 0);
  const payers = rows.filter((r) => r.paid > 0).length;
  const notPaid = rows.filter((r) => r.status === "not_paid").length;
  const unpaidCount = rows.filter((r) => r.status === "not_paid" || r.status === "partial").length;
  const pctDone = ratioPct(target - remaining, target) ?? 0;

  const filtered = show === "paid" ? rows.filter((r) => r.paid > 0) : show === "unpaid" ? rows.filter((r) => r.status === "not_paid" || r.status === "partial") : rows;
  const tableRows = filtered.map((r) => ({
    ...r,
    who: `Roll ${r.roll_no ?? "—"} · ${r.section ?? ""}`,
  }));
  const url = (extra: Record<string, string | boolean | undefined>) => withParams(`/monthly/${month}/${classId}`, { ...qs, show: show === "all" ? undefined : show, ...extra });

  return (
    <div className="space-y-5">
      <PageHeader
        title={d.class.name}
        description={`${d.label} · ${rows.length} students`}
        crumbs={[{ label: "Months", href: withParams("/monthly", { month, ...qs }) }, { label: d.label, href: withParams("/monthly", { month, ...qs }) }]}
        actions={
          <>
            <Link href={withParams(`/monthly/${addMonths(month, -1)}/${classId}`, qs)} className={pill}>
              <ChevronLeft className="size-4" /> {monthLabel(addMonths(month, -1), false)}
            </Link>
            <Link href={withParams(`/monthly/${addMonths(month, 1)}/${classId}`, qs)} className={pill}>
              {monthLabel(addMonths(month, 1), false)} <ChevronRight className="size-4" />
            </Link>
            <LinkButton href={withParams(`/classes/${classId}`, { arrears: arrears || undefined })} variant="plain">
              Class view
            </LinkButton>
          </>
        }
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

      <section className="rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-subhead font-medium text-ink-2">Collected this month</p>
            <p className="figure mt-1 text-[44px] leading-none">{rupeesShort(paid)}</p>
            <p className="mt-2 text-body text-ink-2">
              from <span className="font-semibold text-ink">{payers}</span> of {rows.length} students
            </p>
            <div className="mt-6 max-w-lg">
              <StackedBar
                height="h-3"
                segments={[
                  { value: cur, className: "bg-series-1", label: "This year", display: rupees(cur) },
                  { value: arr, className: "bg-series-2", label: "Old dues", display: rupees(arr) },
                  { value: adv, className: "bg-series-3", label: "Advance", display: rupees(adv) },
                ]}
              />
              <Legend
                className="mt-3"
                items={[
                  { ...KIND_LEGEND[0], value: rupeesShort(cur) },
                  { ...KIND_LEGEND[1], value: rupeesShort(arr) },
                  { ...KIND_LEGEND[2], value: rupeesShort(adv) },
                ]}
              />
            </div>
          </div>
          <div className="flex items-center gap-6 self-center">
            <Ring value={pctDone} size={150} stroke={15} label={`${pct(pctDone, 0)} of this month's dues collected`}>
              <span className="figure text-title1">{Math.round(pctDone)}%</span>
              <span className="text-caption text-ink-2">of {rupeesShort(target)}</span>
            </Ring>
            <div className="space-y-3">
              <div>
                <p className="text-footnote text-ink-2">Still unpaid</p>
                <p className={`text-title3 font-semibold tabular ${remaining > 0 ? "text-critical-ink" : "text-good-ink"}`}>{rupeesShort(remaining)}</p>
              </div>
              <div>
                <p className="text-footnote text-ink-2">Paid nothing</p>
                <p className="text-title3 font-semibold tabular text-ink">{notPaid}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card
        title="Students"
        description="% of balance = share of the student's total unpaid fees (this and earlier sessions) on the 1st that this month's payments cleared."
        actions={
          <Segmented
            size="sm"
            options={[
              { label: `All · ${rows.length}`, href: url({ show: undefined }), active: show === "all" },
              { label: `Paid · ${payers}`, href: url({ show: "paid" }), active: show === "paid" },
              { label: `Unpaid · ${unpaidCount}`, href: url({ show: "unpaid" }), active: show === "unpaid" },
            ]}
          />
        }
      >
        <DataTable
          rows={tableRows as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "father_name", "roll_no"]}
          totals
          pageSize={100}
          exportName={`${d.class.name}-${month}`}
          exportMeta={[`${d.class.name} · ${d.label}`, `Session ${d.session.name}`, `Showing: ${show}`]}
          columns={[
            { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
            { key: "paid", label: "Paid", type: "money", total: true, dimZero: true },
            { key: "paid_for", label: "Paid for", type: "alloc" },
            { key: "pct_of_outstanding", label: "% of balance", type: "pct", hideOnMobile: true },
            { key: "balance_after", label: "Balance now", type: "money", total: true, hideOnMobile: true },
            { key: "status", label: "Status", type: "paystatus" },
          ]}
          empty="No students in this view."
        />
      </Card>
    </div>
  );
}
