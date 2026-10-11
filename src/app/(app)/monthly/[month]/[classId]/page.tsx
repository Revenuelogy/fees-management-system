import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { flag, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { addMonths, monthLabel, num, pct, ratioPct, rupeesShort } from "@/lib/format";
import type { MonthClassDetail, MonthPayment } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { KIND_LEGEND } from "@/components/ui/alloc";

export const metadata = { title: "Class in month" };

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

  // Students no longer enrolled in this session: just list their payments.
  if (classId === "none") {
    const { data } = await supabase.rpc("month_payments", { p_month: monthDate, p_unassigned: true });
    const payments = (data ?? []) as MonthPayment[];
    return (
      <>
        <PageHeader
          title={`Not enrolled / left · ${monthLabel(month)}`}
          description="Payments in this month from students who are not enrolled in the month's session (left the school or passed out)."
          crumbs={[{ label: "Monthly", href: withParams("/monthly", { month, ...qs }) }, { label: monthLabel(month), href: withParams("/monthly", { month, ...qs }) }, { label: "Not enrolled" }]}
        />
        <Card>
          <DataTable
            rows={payments as unknown as Record<string, unknown>[]}
            totals
            exportName={`month-${month}-not-enrolled`}
            columns={[
              { key: "paid_on", label: "Date", type: "date" },
              { key: "receipt_no", label: "Receipt", href: "/payments/{payment_id}" },
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "amount", label: "Amount", type: "money", total: true },
              { key: "allocations", label: "Paid for", type: "alloc" },
            ]}
          />
        </Card>
      </>
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
  const owing = rows.filter((r) => r.target > 0);
  const notPaid = rows.filter((r) => r.status === "not_paid").length;

  const filtered =
    show === "paid" ? rows.filter((r) => r.paid > 0) : show === "unpaid" ? rows.filter((r) => r.status === "not_paid" || r.status === "partial") : rows;
  const tableRows = filtered.map((r) => ({
    ...r,
    roll: r.roll_no ? `${r.section ?? ""}-${r.roll_no}` : r.section,
    receipt_list: r.receipts.map((x) => x.receipt_no).join(", "),
  }));
  const url = (extra: Record<string, string | boolean | undefined>) => withParams(`/monthly/${month}/${classId}`, { ...qs, show: show === "all" ? undefined : show, ...extra });

  return (
    <>
      <PageHeader
        title={`${d.class.name} · ${d.label}`}
        description={`Session ${d.session.name}. Every student in the class: what they paid this month, what it paid for, and what they still owe.`}
        crumbs={[
          { label: d.session.name, href: "/" },
          { label: "Monthly", href: withParams("/monthly", { month, ...qs }) },
          { label: d.label, href: withParams("/monthly", { month, ...qs }) },
          { label: d.class.name },
        ]}
        actions={
          <div className="flex items-center gap-1">
            <Link href={withParams(`/monthly/${addMonths(month, -1)}/${classId}`, qs)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-sm hover:bg-surface-2">
              <ChevronLeft className="size-4" /> {monthLabel(addMonths(month, -1), false)}
            </Link>
            <Link href={withParams(`/monthly/${addMonths(month, 1)}/${classId}`, qs)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-sm hover:bg-surface-2">
              {monthLabel(addMonths(month, 1), false)} <ChevronRight className="size-4" />
            </Link>
            <Link href={withParams(`/classes/${classId}`, { arrears: arrears || undefined })} className="ml-1 inline-flex h-9 items-center rounded-lg border border-line-strong bg-surface px-2.5 text-sm hover:bg-surface-2">
              Class view
            </Link>
          </div>
        }
      >
        <Segmented
          label="Expected"
          options={[
            { label: "Due this month", href: url({ carry: false }), active: !carry },
            { label: "+ carry-over", href: url({ carry: undefined }), active: carry },
          ]}
        />
        <Segmented
          options={[
            { label: "Current session", href: url({ arrears: undefined }), active: !arrears },
            { label: "+ previous dues", href: url({ arrears: true }), active: arrears },
          ]}
        />
      </PageHeader>

      <KpiGrid cols={4}>
        <Kpi label="Received this month" value={rupeesShort(paid)} sub={<>from {payers} of {rows.length} students</>} />
        <Kpi
          label="Expected this month"
          value={rupeesShort(target)}
          meter={ratioPct(target - remaining, target)}
          sub={<>{pct(ratioPct(target - remaining, target))} collected · {owing.length} students owed money</>}
        />
        <Kpi label="Still unpaid" value={rupeesShort(remaining)} tone={remaining > 0 ? "critical" : "good"} sub={<>{notPaid} students paid nothing</>} />
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-[13px] font-medium text-ink-2">Paid for</div>
          <div className="mt-3">
            <StackedBar
              segments={[
                { value: cur, className: "bg-series-1", label: "Current year fees", display: rupeesShort(cur) },
                { value: arr, className: "bg-series-2", label: "Previous dues", display: rupeesShort(arr) },
                { value: adv, className: "bg-series-3", label: "Advance", display: rupeesShort(adv) },
              ]}
            />
          </div>
          <div className="mt-2 text-[12.5px] text-ink-2">
            {rupeesShort(cur)} current · {rupeesShort(arr)} previous dues · {rupeesShort(adv)} advance
          </div>
        </div>
      </KpiGrid>

      <Card
        className="mt-4"
        title="Students"
        description="% of outstanding = share of the student's total unpaid balance (this and earlier sessions) on the 1st of the month that this month's payments cleared."
        actions={
          <Segmented
            options={[
              { label: `All (${rows.length})`, href: url({ show: undefined }), active: show === "all" },
              { label: `Paid (${payers})`, href: url({ show: "paid" }), active: show === "paid" },
              { label: `Not paid / partial (${rows.filter((r) => r.status === "not_paid" || r.status === "partial").length})`, href: url({ show: "unpaid" }), active: show === "unpaid" },
            ]}
          />
        }
      >
        <div className="mb-3">
          <Legend items={KIND_LEGEND} />
        </div>
        <DataTable
          rows={tableRows as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "father_name", "roll_no"]}
          totals
          pageSize={100}
          exportName={`${d.class.name}-${month}`}
          exportMeta={[`${d.class.name} · ${d.label}`, `Session ${d.session.name}`, `Showing: ${show}`, carry ? "Expected includes carry-over" : "Due this month only", arrears ? "Including previous dues" : "Current session only"]}
          columns={[
            { key: "roll", label: "Roll", sortable: true },
            { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
            { key: "paid", label: "Paid this month", type: "money", total: true, dimZero: true },
            { key: "paid_for", label: "Paid for", type: "alloc" },
            { key: "pct_of_outstanding", label: "% of outstanding", type: "pct" },
            { key: "outstanding_start", label: "Owed on 1st", type: "money", total: true, hideOnMobile: true },
            { key: "balance_after", label: "Balance after", type: "money", total: true },
            { key: "target_remaining", label: "Month due left", type: "money", total: true, alertPositive: true, hideOnMobile: true },
            { key: "status", label: "Status", type: "paystatus" },
            { key: "receipt_list", label: "Receipts", hideOnMobile: true },
          ]}
          empty="No students in this view."
        />
        <p className="mt-3 text-[12.5px] text-muted">
          {num(rows.length)} students enrolled. Totals at the bottom match the class row on the month page.
        </p>
      </Card>
    </>
  );
}
