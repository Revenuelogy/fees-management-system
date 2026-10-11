import Link from "next/link";
import { IndianRupee } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { getActiveSession, getSessions, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { MODE_LABELS, addMonths, fmtDate, num, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { BarList } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { LinkButton } from "@/components/ui/button";
import { DateRangeForm } from "./date-range-form";

export const metadata = { title: "Payments & receipts" };

type Row = {
  id: string;
  receipt_no: string;
  paid_on: string;
  amount: number;
  mode: string;
  reference_no: string | null;
  remarks: string | null;
  source: string;
  session_id: string;
  student_id: string;
  reverses_payment_id: string | null;
  students: { full_name: string; admission_no: string; father_name: string | null } | null;
  allocations: { amount: number; kind: "current" | "arrears" | "advance" }[];
};

function monthEnd(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  const sessions = await getSessions();
  const today = todayIST();
  const thisMonth = today.slice(0, 7);
  const preset = param(sp.preset) ?? (param(sp.from) ? "custom" : "month");

  let from: string;
  let to: string;
  switch (preset) {
    case "today":
      from = to = today;
      break;
    case "yesterday": {
      const y = new Date(today + "T00:00:00Z");
      y.setUTCDate(y.getUTCDate() - 1);
      from = to = y.toISOString().slice(0, 10);
      break;
    }
    case "last_month": {
      const lm = addMonths(thisMonth, -1);
      from = `${lm}-01`;
      to = monthEnd(lm);
      break;
    }
    case "session":
      from = session?.start_date ?? `${thisMonth}-01`;
      to = session?.end_date ?? today;
      break;
    case "custom":
      from = param(sp.from) ?? `${thisMonth}-01`;
      to = param(sp.to) ?? today;
      break;
    default:
      from = `${thisMonth}-01`;
      to = today;
  }

  const supabase = await createClient();
  const rows = await fetchAll<Row>((a, b) =>
    supabase
      .from("payments")
      .select(
        "id, receipt_no, paid_on, amount, mode, reference_no, remarks, source, session_id, student_id, reverses_payment_id, students(full_name, admission_no, father_name), allocations(amount, kind)",
      )
      .gte("paid_on", from)
      .lte("paid_on", to)
      .order("paid_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(a, b),
  );

  // class of each student in the session the payment belongs to
  const sessionIds = [...new Set(rows.map((r) => r.session_id))];
  const enrollments = sessionIds.length
    ? await fetchAll<{ student_id: string; session_id: string; section: string; classes: { name: string } | null }>((a, b) =>
        supabase.from("enrollments").select("student_id, session_id, section, classes(name)").in("session_id", sessionIds).order("id").range(a, b),
      )
    : [];
  const classOf = new Map(enrollments.map((e) => [`${e.student_id}|${e.session_id}`, e]));
  const cancelledIds = new Set(rows.filter((r) => r.reverses_payment_id).map((r) => r.reverses_payment_id as string));

  const table = rows.map((r) => {
    const e = classOf.get(`${r.student_id}|${r.session_id}`);
    const split = { current: 0, arrears: 0, advance: 0 };
    for (const a of r.allocations ?? []) split[a.kind] += a.amount;
    return {
      payment_id: r.id,
      receipt_no: r.receipt_no,
      paid_on: r.paid_on,
      student_id: r.student_id,
      full_name: r.students?.full_name ?? "",
      admission_no: r.students?.admission_no ?? "",
      father_name: r.students?.father_name ?? "",
      class_name: e?.classes?.name ?? "—",
      section: e?.section ?? "",
      amount: r.amount,
      current: split.current,
      arrears: split.arrears,
      advance: split.advance,
      mode: r.mode,
      reference_no: r.reference_no,
      status: r.reverses_payment_id ? "Cancellation entry" : cancelledIds.has(r.id) ? "Cancelled" : r.source === "import" ? "Imported" : "",
    };
  });

  const net = rows.reduce((a, r) => a + r.amount, 0);
  const receipts = rows.filter((r) => r.amount > 0).length;
  const reversals = rows.filter((r) => r.amount < 0);
  const byMode = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const m = byMode.get(r.mode) ?? { amount: 0, count: 0 };
    m.amount += r.amount;
    if (r.amount > 0) m.count += 1;
    byMode.set(r.mode, m);
  }
  const split = table.reduce((a, r) => ({ current: a.current + r.current, arrears: a.arrears + r.arrears, advance: a.advance + r.advance }), { current: 0, arrears: 0, advance: 0 });
  const presetHref = (p: string) => withParams("/payments", { preset: p === "month" ? undefined : p });

  return (
    <>
      <PageHeader
        title="Payments & receipts"
        description={`Every receipt from ${fmtDate(from)} to ${fmtDate(to)}. Cancelled receipts stay on record with a reversing entry.`}
        crumbs={[{ label: "Fees" }, { label: "Payments" }]}
        actions={
          canWrite(viewer.role) ? (
            <LinkButton href="/collect" variant="primary">
              <IndianRupee className="size-4" /> Collect fee
            </LinkButton>
          ) : undefined
        }
      >
        <Segmented
          options={[
            { label: "Today", href: presetHref("today"), active: preset === "today" },
            { label: "Yesterday", href: presetHref("yesterday"), active: preset === "yesterday" },
            { label: "This month", href: presetHref("month"), active: preset === "month" },
            { label: "Last month", href: presetHref("last_month"), active: preset === "last_month" },
            { label: session ? `Session ${session.name}` : "Session", href: presetHref("session"), active: preset === "session" },
          ]}
        />
        <DateRangeForm from={from} to={to} />
      </PageHeader>

      <KpiGrid cols={4}>
        <Kpi label="Received (net)" value={rupeesShort(net)} sub={`${num(receipts)} receipts`} />
        <Kpi
          label="Current-year fees"
          value={rupeesShort(split.current)}
          sub={`${pct(ratioPct(split.current, net), 0)} of money received`}
        />
        <Kpi label="Previous dues recovered" value={rupeesShort(split.arrears)} sub={`${pct(ratioPct(split.arrears, net), 0)} · advance ${rupeesShort(split.advance)}`} />
        <Kpi
          label="Cancelled"
          value={num(reversals.length)}
          tone={reversals.length ? "critical" : "default"}
          sub={reversals.length ? `${rupees(reversals.reduce((a, r) => a + r.amount, 0))} reversed` : "No cancellations"}
        />
      </KpiGrid>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card title={`${num(rows.length)} entries`}>
          <DataTable
            rows={table as unknown as Record<string, unknown>[]}
            searchKeys={["receipt_no", "full_name", "admission_no", "father_name", "reference_no", "class_name"]}
            searchPlaceholder="Receipt, student, cheque/UTR…"
            filters={[
              { key: "mode", label: "Mode", options: Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label })) },
              { key: "class_name", label: "Class", options: [...new Set(table.map((r) => r.class_name))].sort().map((c) => ({ value: c, label: c })) },
              {
                key: "status",
                label: "Status",
                options: [
                  { value: "Cancelled", label: "Cancelled" },
                  { value: "Cancellation entry", label: "Cancellation entry" },
                  { value: "Imported", label: "Imported" },
                ],
              },
            ]}
            totals
            exportName={`payments-${from}-to-${to}`}
            exportMeta={[`Payments ${from} to ${to}`]}
            columns={[
              { key: "paid_on", label: "Date", type: "date" },
              { key: "receipt_no", label: "Receipt", href: "/payments/{payment_id}", sub: "status" },
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: "amount", label: "Amount", type: "money", total: true },
              { key: "current", label: "Current yr", type: "money", total: true, dimZero: true, hideOnMobile: true },
              { key: "arrears", label: "Prev. dues", type: "money", total: true, dimZero: true, hideOnMobile: true },
              { key: "advance", label: "Advance", type: "money", total: true, dimZero: true, hideOnMobile: true },
              { key: "mode", label: "Mode", type: "mode", sub: "reference_no" },
            ]}
            empty="No payments in this period."
          />
        </Card>
        <Card title="By mode">
          <BarList
            labelWidth="w-24"
            rows={[...byMode.entries()]
              .sort((a, b) => b[1].amount - a[1].amount)
              .map(([m, v]) => ({ label: MODE_LABELS[m] ?? m, value: v.amount, display: rupeesShort(v.amount), sub: `${v.count}` }))}
          />
          <p className="mt-4 text-[12.5px] text-muted">
            Need the month-wise picture? Open <Link href="/monthly" className="text-accent hover:underline">Monthly analysis</Link>.
          </p>
          {sessions.length > 1 && <p className="mt-2 text-[12.5px] text-muted">Class shown is the student&apos;s class in the session of each payment.</p>}
        </Card>
      </div>
    </>
  );
}
