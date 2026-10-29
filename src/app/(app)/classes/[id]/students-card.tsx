"use client";

import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDate, rupeesShort } from "@/lib/format";
import { MONEY, installmentName } from "@/lib/glossary";
import { plural } from "@/lib/text";
import type { ClassDetail, ClassFeeLines, FeeStatus, StudentBalance } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Select } from "@/components/ui/form";
import { Pending } from "@/components/ui/page-state";
import { withParams } from "@/components/ui/segmented";
import { FEE_STATUS, PAY_STATUS_LABELS } from "@/components/ui/status";

const STATUS_KEYS = ["paid_up", "partial", "not_paying", "arrears_only", "free", "no_plan"] as const satisfies readonly FeeStatus[];
// the line statuses as the coloured pay tags (paid / part paid / not paid / nothing due)
const PAY = { paid: "paid", partial: "partial", not_paid: "not_paid", nothing: "nothing_due" } as const;

/**
 * The students of a class. By default every student's fees of the year (with what is due from past years); pick an
 * installment and/or a fee type to see, for each student, what they must pay for it, what was received and what is
 * left (class_fee_lines()).
 */
export function StudentsCard({
  d,
  balances,
  sessionId,
  section,
  installmentId,
  feeHeadId,
}: {
  d: ClassDetail;
  balances: StudentBalance[];
  sessionId: string;
  section?: string;
  installmentId?: string;
  feeHeadId?: string;
}) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  // the options (installments and fee types of this class) come with the lines; without a choice the call is the
  // class's fees by student, cheap enough to also serve as the option list
  const lines = useApi<ClassFeeLines>(
    apiUrl(`/api/analytics/classes/${d.class.id}/lines`, { session: sessionId, installment: installmentId, fee_head: feeHeadId, section }),
  );
  const go = (next: { inst?: string; type?: string }) =>
    router.replace(withParams(`/classes/${d.class.id}`, { section, inst: next.inst || undefined, type: next.type || undefined }), { scroll: false });
  const chosen = !!(installmentId || feeHeadId);

  const pickers = (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Installment"
        value={installmentId ?? ""}
        onChange={(e) => go({ inst: e.target.value, type: feeHeadId })}
        className="h-9 w-auto min-w-[150px] text-footnote"
      >
        <option value="">All installments</option>
        {(lines.data?.options.installments ?? d.installments).map((i) => (
          <option key={i.id} value={i.id}>
            {installmentName(i.name)}
          </option>
        ))}
      </Select>
      <Select aria-label="Fee type" value={feeHeadId ?? ""} onChange={(e) => go({ inst: installmentId, type: e.target.value })} className="h-9 w-auto min-w-[140px] text-footnote">
        <option value="">All fee types</option>
        {(lines.data?.options.fee_heads ?? []).map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </Select>
    </div>
  );

  if (!chosen) {
    return (
      <Card title="Students" subtitle="Every student's fees this year. Pick an installment or a fee type to see it student by student." actions={pickers}>
        <AllFees d={d} rows={balances} section={section} today={today} />
      </Card>
    );
  }

  const l = lines.data;
  const what = l ? [l.installment ? installmentName(l.installment.name) : null, l.fee_head?.name].filter(Boolean).join(" · ") : "";
  return (
    <Card title={what ? `Students · ${what}` : "Students"} actions={pickers}>
      {!l ? (
        <Pending queries={[lines]} />
      ) : (
        <>
          <Summary l={l} />
          <DataTable
            key={`${installmentId}-${feeHeadId}`}
            rows={l.rows.map((r) => ({ ...r, who: `Roll ${r.roll_no ?? "—"} · ${r.section}${r.father_name ? " · " + r.father_name : ""}`, pay: PAY[r.status] })) as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "father_name", "phone", "roll_no"]}
            filters={[
              {
                key: "pay",
                label: "Status",
                options: (Object.keys(PAY) as (keyof typeof PAY)[])
                  .filter((k) => l.rows.some((r) => r.status === k))
                  .map((k) => ({ value: PAY[k], label: PAY_STATUS_LABELS[PAY[k]] })),
              },
              ...(d.sections.length > 1 && !section ? [{ key: "section", label: "Section", options: d.sections.map((s) => ({ value: s.section, label: s.section })) }] : []),
            ]}
            totals
            pageSize={100}
            defaultSort={{ key: "remaining", dir: "desc" }}
            exportName={`${d.class.name}-${what}-${d.session.name}`}
            exportMeta={[
              `${d.class.name}${section ? ` · section ${section}` : ""} · Session ${d.session.name}`,
              what,
              l.installment ? `Due ${fmtDate(l.installment.due_date)}` : "",
              `As of ${fmtDate(l.today)}`,
            ].filter(Boolean)}
            columns={
              [
                { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
                { key: "to_pay", label: "To pay", type: "money", total: true },
                { key: "concession", label: "Concession", type: "money", total: true, dimZero: true, hideOnMobile: true },
                { key: "received", label: "Received", type: "money", total: true },
                { key: "remaining", label: "Remaining", type: "money", total: true, alertPositive: true },
                ...(l.summary.due_now > 0 ? [{ key: "due_now", label: MONEY.due_now.label, type: "money" as const, total: true, alertPositive: true, hideOnMobile: true }] : []),
                ...(l.summary.due_later > 0 ? [{ key: "due_later", label: MONEY.due_later.label, type: "money" as const, total: true, hideOnMobile: true }] : []),
                { key: "pay", label: "Status", type: "paystatus" },
              ] satisfies Column[]
            }
            empty="No students in this view."
          />
        </>
      )}
    </Card>
  );
}

/** The chosen installment / fee type in one line: to pay, received, remaining, and how many students paid. */
function Summary({ l }: { l: ClassFeeLines }) {
  const s = l.summary;
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Fig label="To pay" value={rupeesShort(s.to_pay)} sub={l.installment ? `due ${fmtDate(l.installment.due_date)}` : `${plural(s.students, "student")}`} />
      <Fig label="Received" value={rupeesShort(s.received)} sub={`${s.received_pct ?? 0}% of it`} tone="text-good-ink" />
      <Fig
        label="Remaining"
        value={rupeesShort(s.remaining)}
        sub={s.remaining === 0 ? "fully received" : s.due_now > 0 ? `${rupeesShort(s.due_now)} due till today` : "due later"}
        tone={s.due_now > 0 ? "text-critical-ink" : undefined}
      />
      <Fig label="Students" value={`${s.paid} of ${s.students - s.nothing}`} sub={`paid in full · ${s.partial} part paid · ${s.not_paid} not paid`} />
    </div>
  );
}

function Fig({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-fill-2 px-3.5 py-3">
      <p className="text-footnote font-medium text-ink-2">{label}</p>
      <p className={cn("figure mt-1 text-title3", tone ?? "text-ink")}>{value}</p>
      <p className="mt-0.5 text-caption text-muted">{sub}</p>
    </div>
  );
}

/** Every student's fees of the year, with what is due from past years. */
function AllFees({ d, rows, section, today }: { d: ClassDetail; rows: StudentBalance[]; section?: string; today: string }) {
  const students = rows.map((s) => ({
    ...s,
    who: `Roll ${s.roll_no ?? "—"} · ${s.section}${s.father_name ? " · " + s.father_name : ""}`,
    past_due: s.prev_pending > 0 ? "yes" : "no",
  }));
  return (
    <DataTable
      rows={students as unknown as Record<string, unknown>[]}
      searchKeys={["full_name", "admission_no", "father_name", "phone", "roll_no"]}
      filters={[
        {
          key: "fee_status",
          label: "Status",
          // only the tags some student here has
          options: STATUS_KEYS.filter((k) => rows.some((r) => r.fee_status === k)).map((k) => ({ value: k, label: FEE_STATUS[k].label })),
        },
        {
          key: "past_due",
          label: MONEY.old_balance.label,
          options: [
            { value: "yes", label: `Has ${MONEY.old_balance.label.toLowerCase()}` },
            { value: "no", label: `No ${MONEY.old_balance.label.toLowerCase()}` },
          ],
        },
        ...(d.sections.length > 1 && !section ? [{ key: "section", label: "Section", options: d.sections.map((s) => ({ value: s.section, label: s.section })) }] : []),
      ]}
      totals
      pageSize={100}
      exportName={`${d.class.name}-${d.session.name}`}
      exportMeta={[
        `${d.class.name}${section ? ` · section ${section}` : ""} · Session ${d.session.name}`,
        `${MONEY.total_fee.label}, ${MONEY.received.label.toLowerCase()}, remaining and due till today are this year's fees; ${MONEY.old_balance.label.toLowerCase()} is separate; ${MONEY.to_recover.label.toLowerCase()} = due till today + ${MONEY.old_balance.label.toLowerCase()}`,
        `As of ${fmtDate(today)}`,
      ]}
      columns={[
        { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
        { key: "expected", label: MONEY.total_fee.label, type: "money", total: true, hideOnMobile: true },
        { key: "received", label: MONEY.received.label, type: "money", total: true, hideOnMobile: true },
        { key: "pending", label: MONEY.balance.label, type: "money", total: true },
        { key: "overdue", label: MONEY.due_now.label, type: "money", total: true, alertPositive: true },
        { key: "prev_pending", label: MONEY.old_balance.label, type: "money", total: true, dimZero: true, hideOnMobile: true },
        { key: "total_overdue", label: MONEY.to_recover.label, type: "money", total: true, alertPositive: true, hideOnMobile: true },
        { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
        { key: "fee_status", label: "Status", type: "status" },
      ]}
    />
  );
}
