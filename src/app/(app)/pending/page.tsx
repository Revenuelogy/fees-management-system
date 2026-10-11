import { requireStaff, canWrite } from "@/lib/auth";
import { flag, getActiveSession, getClasses, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { fmtDate, num, rupeesShort, todayIST } from "@/lib/format";
import type { FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FEE_STATUS } from "@/components/ui/status";
import { NoSession } from "@/components/no-session";
import { PrintButton } from "@/components/ui/print-button";

export const metadata = { title: "Pending fees" };

export default async function PendingPage({ searchParams }: PageProps<"/pending">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const arrears = flag(sp.arrears, false);
  const due = flag(sp.due, false);
  const prev = flag(sp.prev, false);
  const unassigned = flag(sp.unassigned, false);
  const status = param(sp.status) as FeeStatus | undefined;
  const classId = param(sp.class);

  const supabase = await createClient();
  const [all, classes] = await Promise.all([
    fetchAll<StudentBalance>((a, b) =>
      supabase.rpc("student_balances", { p_session: session.id }).order("class_order", { nullsFirst: false }).order("section").order("full_name").order("student_id").range(a, b),
    ),
    getClasses(),
  ]);

  const owed = (r: StudentBalance) => (due ? (arrears ? r.total_overdue : r.overdue) : arrears ? r.total_pending : r.pending);
  const rows = all
    .filter((r) => owed(r) > 0)
    .filter((r) => !prev || r.prev_pending > 0)
    .filter((r) => !unassigned || r.class_id === null)
    .filter((r) => !status || r.fee_status === status)
    .filter((r) => !classId || r.class_id === classId)
    .map((r) => ({
      ...r,
      class_label: r.class_name ?? "Not enrolled / left",
      owed: owed(r),
      show_pending: arrears ? r.total_pending : r.pending,
      show_overdue: arrears ? r.total_overdue : r.overdue,
      collect: "Collect",
    }));

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const url = (extra: Record<string, string | boolean | undefined>) =>
    withParams("/pending", { arrears: arrears || undefined, due: due || undefined, prev: prev || undefined, unassigned: unassigned || undefined, status, class: classId, ...extra });
  const meta = [
    `Session ${session.name}`,
    arrears ? "Including previous dues" : "Current session only",
    due ? "Overdue only (installments already due)" : "All pending (incl. installments not yet due)",
    ...(prev ? ["Only students with previous dues"] : []),
    ...(status ? [`Status: ${FEE_STATUS[status]?.label}`] : []),
    `As of ${fmtDate(todayIST())}`,
  ];
  const statusKeys: FeeStatus[] = ["partial", "not_paying", "arrears_only", "paid_up"];
  const columns = [
    { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
    { key: "class_label", label: "Class", sub: "section" },
    { key: "father_name", label: "Father", hideOnMobile: true },
    { key: "phone", label: "Phone" },
    { key: "expected", label: "Session fees", type: "money" as const, total: true, hideOnMobile: true },
    { key: "received", label: "Paid", type: "money" as const, total: true, hideOnMobile: true },
    { key: "show_pending", label: "Pending", type: "money" as const, total: true },
    { key: "show_overdue", label: "Overdue", type: "money" as const, total: true, alertPositive: true },
    { key: "prev_pending", label: "Prev. dues", type: "money" as const, total: true, dimZero: true },
    { key: "last_paid_on", label: "Last paid", type: "date" as const, hideOnMobile: true },
    { key: "days_since_payment", label: "Days silent", type: "number" as const, hideOnMobile: true },
    { key: "fee_status", label: "Status", type: "status" as const },
    ...(canWrite(viewer.role) ? [{ key: "collect", label: "", href: "/collect/{student_id}", sortable: false }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Pending fees"
        description={`Who owes what in session ${session.name}. Filter, sort, export to Excel (CSV) or print the list for calls.`}
        crumbs={[{ label: "Fees" }, { label: "Pending fees" }]}
        actions={<PrintButton label="Print list" />}
      >
        <Segmented
          options={[
            { label: "Current session", href: url({ arrears: undefined }), active: !arrears },
            { label: "+ previous dues", href: url({ arrears: true }), active: arrears },
          ]}
        />
        <Segmented
          options={[
            { label: "All pending", href: url({ due: undefined }), active: !due, title: "Includes installments not yet due" },
            { label: "Overdue only", href: url({ due: true }), active: due, title: "Only installments whose due date has passed" },
          ]}
        />
        <Segmented
          options={[
            { label: "Everyone", href: url({ prev: undefined, unassigned: undefined }), active: !prev && !unassigned },
            { label: "Has previous dues", href: url({ prev: true, arrears: true, unassigned: undefined }), active: prev },
            { label: "Left / not enrolled", href: url({ unassigned: true, arrears: true, prev: undefined }), active: unassigned },
          ]}
        />
      </PageHeader>

      <div className="print-only mb-3 text-sm">
        <b>Pending fees · {session.name}</b> — {meta.join(" · ")}
      </div>

      <KpiGrid cols={4}>
        <Kpi label="Students" value={num(rows.length)} sub={`of ${num(all.filter((r) => r.class_id).length)} enrolled`} />
        <Kpi label="Pending" value={rupeesShort(sum((r) => r.show_pending))} />
        <Kpi label="Overdue" value={rupeesShort(sum((r) => r.show_overdue))} tone="critical" />
        <Kpi label="Previous dues" value={rupeesShort(sum((r) => r.prev_pending))} sub={arrears ? "included above" : "not included above"} />
      </KpiGrid>

      <Card className="mt-4 print-plain">
        <DataTable
          rows={rows as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "father_name", "phone", "class_label"]}
          filters={[
            {
              key: "class_label",
              label: "Class",
              options: [...classes.map((c) => ({ value: c.name, label: c.name })), { value: "Not enrolled / left", label: "Not enrolled / left" }].filter((o) =>
                rows.some((r) => r.class_label === o.value),
              ),
            },
            { key: "section", label: "Section", options: [...new Set(rows.map((r) => r.section).filter(Boolean))].sort().map((s) => ({ value: s as string, label: s as string })) },
            { key: "fee_status", label: "Status", options: statusKeys.map((s) => ({ value: s, label: FEE_STATUS[s].label })) },
          ]}
          defaultSort={{ key: "show_overdue", dir: "desc" }}
          totals
          pageSize={100}
          exportName={`pending-fees-${session.name}`}
          exportMeta={meta}
          columns={columns}
          empty="No pending fees with these filters."
        />
      </Card>
    </>
  );
}
