"use client";

import Link from "next/link";
import { flag, param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, rupeesShort, todayIST } from "@/lib/format";
import type { FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FEE_STATUS, STATUS_STYLE } from "@/components/ui/status";
import { MONEY, moneyHint } from "@/lib/glossary";
import { NoSession } from "@/components/no-session";
import { PrintButton } from "@/components/ui/print-button";

export function PendingView({ sp }: { sp: SearchParams }) {
  const { session, classes, writer } = useApp();
  const balances = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/balances", { session: session.id }) : null);
  if (!session) return <NoSession />;
  if (!balances.data) return <Pending queries={[balances]} />;
  const due = flag(sp.due, false);
  const prev = flag(sp.prev, false);
  const unassigned = flag(sp.unassigned, false);
  const status = param(sp.status) as FeeStatus | undefined;
  const classId = param(sp.class);

  const all = balances.data;

  // this year (Balance, or Due now) and Old balance stay separate figures; a student is listed when either is owed
  const owed = (r: StudentBalance) => (due ? r.overdue : r.pending) + r.prev_pending;
  const rows = all
    .filter((r) => owed(r) > 0)
    .filter((r) => !prev || r.prev_pending > 0)
    .filter((r) => !unassigned || r.class_id === null)
    .filter((r) => !status || r.fee_status === status)
    .filter((r) => !classId || r.class_id === classId)
    .map((r) => ({
      ...r,
      class_label: r.class_name ?? "Not enrolled / left",
      collect: "Collect",
    }));

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const url = (extra: Record<string, string | boolean | undefined>) =>
    withParams("/pending", { due: due || undefined, prev: prev || undefined, unassigned: unassigned || undefined, status, class: classId, ...extra });
  const className = classId ? classes.find((c) => c.id === classId)?.name : undefined;
  const meta = [
    `Session ${session.name}`,
    due ? "Due now (installments past their due date) and old balance" : "Balance (all of this year's fees not yet received) and old balance",
    ...(prev ? ["Only students with an old balance"] : []),
    ...(unassigned ? ["Only students not enrolled this year / left"] : []),
    ...(className ? [`Class: ${className}`] : []),
    ...(status ? [`Status: ${FEE_STATUS[status]?.label}`] : []),
    `As of ${fmtDate(todayIST())}`,
  ];
  const statusKeys: FeeStatus[] = ["partial", "not_paying", "arrears_only", "paid_up"];
  const columns = [
    { key: "full_name", label: "Student", type: "person" as const, href: "/students/{student_id}", sub: "who" },
    { key: "phone", label: "Phone", hideOnMobile: true },
    { key: "pending", label: MONEY.balance.label, type: "money" as const, total: true },
    { key: "overdue", label: MONEY.due_now.label, type: "money" as const, total: true, alertPositive: true },
    { key: "prev_pending", label: MONEY.old_balance.label, type: "money" as const, total: true, dimZero: true },
    { key: "days_since_payment", label: MONEY.days_since_payment.label, type: "number" as const, hideOnMobile: true },
    { key: "fee_status", label: "Status", type: "status" as const },
    ...(writer ? [{ key: "collect", label: "", type: "action" as const, href: "/collect/{student_id}", sortable: false }] : []),
  ];
  const statusCounts = statusKeys.map((k) => ({ k, n: rows.filter((r) => r.fee_status === k).length })).filter((x) => x.n > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fees due"
        description={`${session.name} · ${rows.length} students${className ? ` · ${className}` : ""}`}
        info={`Who has fees due. ${moneyHint("balance")} ${moneyHint("due_now")} ${moneyHint("old_balance")} Filter, sort, export to Excel (CSV) or print the list for calls.`}
        actions={<PrintButton label="Print" />}
      >
        <Segmented
          options={[
            { label: "Balance", href: url({ due: undefined }), active: !due, title: "All of this year's fees not yet received, including installments due later" },
            { label: "Due now", href: url({ due: true }), active: due, title: "Only installments whose due date has passed" },
          ]}
        />
        <Segmented
          options={[
            { label: "Everyone", href: url({ prev: undefined, unassigned: undefined }), active: !prev && !unassigned },
            { label: "Has old balance", href: url({ prev: true, unassigned: undefined }), active: prev },
            { label: "Left school", href: url({ unassigned: true, prev: undefined }), active: unassigned },
          ]}
        />
        {className && (
          <Link href={url({ class: undefined })} className="inline-flex h-8 items-center gap-1 rounded-full bg-ink px-3 text-footnote font-medium text-surface">
            {className} ✕
          </Link>
        )}
      </PageHeader>

      <div className="print-only mb-3 text-sm">
        <b>Fees due · {session.name}</b> — {meta.join(" · ")}
      </div>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: MONEY.balance.label, value: rupeesShort(sum((r) => r.pending)), tone: "text-ink" },
          { label: MONEY.due_now.label, value: rupeesShort(sum((r) => r.overdue)), tone: "text-critical-ink" },
          { label: MONEY.old_balance.label, value: rupeesShort(sum((r) => r.prev_pending)), tone: "text-serious-ink" },
          { label: "Students", value: String(rows.length), tone: "text-ink" },
        ].map((x) => (
          <div key={x.label} className="rounded-[var(--radius-card)] bg-surface p-5 shadow-card">
            <p className="text-footnote font-medium text-ink-2">{x.label}</p>
            <p className={`figure mt-2 text-[28px] leading-none ${x.tone}`}>{x.value}</p>
          </div>
        ))}
      </section>

      {statusCounts.length > 0 && (
        <div className="no-print flex flex-wrap gap-2">
          {statusCounts.map(({ k, n }) => (
            <Link
              key={k}
              href={url({ status: status === k ? undefined : k })}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-footnote font-medium transition-colors ${status === k ? "bg-ink text-surface" : "bg-surface text-ink shadow-card hover:bg-fill-2"}`}
            >
              <span className={`size-2 rounded-full ${STATUS_STYLE[k].dot}`} aria-hidden />
              {FEE_STATUS[k].label}
              <span className="tabular opacity-70">{n}</span>
            </Link>
          ))}
        </div>
      )}

      <Card className="print-plain">
        <DataTable
          rows={rows.map((r) => ({ ...r, who: `${r.class_label}${r.section ? " · " + r.section : ""}${r.father_name ? " · " + r.father_name : ""}`, collect: "Collect" })) as unknown as Record<string, unknown>[]}
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
          ]}
          defaultSort={{ key: "overdue", dir: "desc" }}
          totals
          pageSize={50}
          exportName={`fees-due-${session.name}`}
          exportMeta={meta}
          columns={columns}
          empty="No fees due with these filters."
        />
      </Card>
    </div>
  );
}
