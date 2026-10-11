import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { ClassDetail, FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { BarList, Meter } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { FEE_STATUS, FeeStatusBadge } from "@/components/ui/status";
import { NoSession } from "@/components/no-session";
import { cn } from "@/lib/cn";

export const metadata = { title: "Class" };

export default async function ClassPage({ params, searchParams }: PageProps<"/classes/[id]">) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const arrears = flag(sp.arrears, false);
  const section = param(sp.section);
  const supabase = await createClient();

  const [detailRes, studentsRes] = await Promise.all([
    supabase.rpc("class_detail", { p_session: session.id, p_class: id, p_include_arrears: arrears }),
    (() => {
      let q = supabase.rpc("student_balances", { p_session: session.id }).eq("class_id", id);
      if (section) q = q.eq("section", section);
      return q.order("section").order("full_name");
    })(),
  ]);
  if (detailRes.error?.message?.includes("Unknown")) notFound();
  if (detailRes.error || !detailRes.data) throw new Error(detailRes.error?.message ?? "Could not load class");
  const d = detailRes.data as ClassDetail;
  const k = d.kpis;
  const students = ((studentsRes.data ?? []) as StudentBalance[]).map((s) => ({
    ...s,
    roll: s.roll_no ? `${s.section}-${s.roll_no}` : s.section,
    show_pending: arrears ? s.total_pending : s.pending,
    show_overdue: arrears ? s.total_overdue : s.overdue,
  }));
  const url = (extra: Record<string, string | boolean | undefined>) =>
    withParams(`/classes/${id}`, { arrears: arrears || undefined, section, ...extra });
  const statusKeys: FeeStatus[] = ["paid_up", "partial", "arrears_only", "not_paying", "free"];

  return (
    <>
      <PageHeader
        title={d.class.name}
        description={`Session ${d.session.name}${section ? ` · Section ${section}` : ""} · ${k.students} students`}
        crumbs={[{ label: d.session.name, href: "/" }, { label: "Classes", href: withParams("/classes", { arrears: arrears || undefined }) }, { label: d.class.name }]}
      >
        <Segmented
          options={[
            { label: "Current session only", href: url({ arrears: undefined }), active: !arrears },
            { label: "Including previous dues", href: url({ arrears: true }), active: arrears },
          ]}
        />
        {d.sections.length > 1 && (
          <Segmented
            label="Section"
            options={[
              { label: "All", href: url({ section: undefined }), active: !section },
              ...d.sections.map((s) => ({ label: `${s.section} (${s.students})`, href: url({ section: s.section }), active: section === s.section })),
            ]}
          />
        )}
      </PageHeader>

      {section && (
        <p className="-mt-2 mb-3 text-[12.5px] text-muted">The figures below are for the whole class; the student table is filtered to section {section}.</p>
      )}

      <KpiGrid cols={5}>
        <Kpi label="Expected" value={rupeesShort(k.expected)} sub={`${k.students} students · ${rupeesShort(k.concession)} concessions`} />
        <Kpi label="Received" value={rupeesShort(k.received)} meter={ratioPct(k.received, k.expected)} sub={`${pct(ratioPct(k.received, k.expected))} of expected`} />
        <Kpi label="Pending" value={rupeesShort(k.pending)} sub={arrears ? `incl. ${rupeesShort(k.prev_pending)} previous dues` : `${rupeesShort(k.prev_pending)} previous dues not included`} />
        <Kpi
          label="Overdue"
          value={rupeesShort(k.overdue)}
          tone={k.overdue > 0 ? "critical" : "good"}
          sub={`${pct(ratioPct(k.due_expected - k.overdue, k.due_expected))} of ${rupeesShort(k.due_expected)} due-to-date collected`}
        />
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-[13px] font-medium text-ink-2">Students by status</div>
          <ul className="mt-2 space-y-1">
            {statusKeys
              .filter((s) => (k.status[s as keyof typeof k.status] ?? 0) > 0)
              .map((s) => (
                <li key={s} className="flex items-center justify-between text-[13px]">
                  <FeeStatusBadge status={s} />
                  <b className="tabular">{k.status[s as keyof typeof k.status]}</b>
                </li>
              ))}
          </ul>
        </div>
      </KpiGrid>

      <Card className="mt-4" title="Month by month" description="Money received from this class each month against installments due that month. Open a month to see which students paid.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
          {d.months.map((m) => {
            const ratio = m.expected > 0 ? ratioPct(m.received, m.expected) : null;
            return (
              <Link
                key={m.month}
                href={withParams(`/monthly/${m.month}/${id}`, { arrears: arrears || undefined })}
                className={cn(
                  "rounded-lg border border-line p-2.5 transition-colors hover:border-accent hover:bg-surface-2",
                  m.is_future && "opacity-60",
                )}
                title={`${m.label}: received ${rupees(m.received)} (${rupees(m.current)} current, ${rupees(m.arrears)} previous dues), scheduled ${rupees(m.expected)}, ${m.payers} payers`}
              >
                <div className="text-[12px] font-medium text-ink-2">{m.label}</div>
                <div className="mt-1 text-[15px] font-semibold tabular text-ink">{rupeesShort(m.received)}</div>
                <div className="text-[11.5px] text-muted">
                  {m.expected > 0 ? `of ${rupeesShort(m.expected)} due` : "nothing due"} · {m.payers} paid
                </div>
                {ratio !== null && <Meter value={ratio} className="mt-1.5" />}
              </Link>
            );
          })}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Installments" description="Expected, received and gap for this class per installment.">
          <div className="grid gap-3 sm:grid-cols-3">
            {d.installments.map((i) => (
              <Link key={i.id} href={`/installments/${i.number}`} className="rounded-lg border border-line p-3 hover:border-accent hover:bg-surface-2">
                <div className="text-[13px] font-medium text-ink">{i.name}</div>
                <div className="text-[12px] text-muted">due {fmtDate(i.due_date)}</div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold tabular">{pct(i.collection_pct)}</span>
                  <span className={`text-[12.5px] tabular ${i.gap > 0 ? "text-critical-ink" : "text-good-ink"}`}>{rupeesShort(i.gap)} gap</span>
                </div>
                <Meter value={i.collection_pct} className="mt-1.5" />
                <div className="mt-1.5 text-[12px] text-ink-2">
                  {rupeesShort(i.received)} of {rupeesShort(i.expected)}
                </div>
              </Link>
            ))}
          </div>
        </Card>
        <Card title="How much each student has paid" description="Share of this session's fees paid, per student.">
          <BarList
            labelWidth="w-24"
            max={Math.max(1, k.bands.full + k.bands.over_half + k.bands.under_half + k.bands.nothing)}
            rows={[
              { label: "Paid 100%", value: k.bands.full, display: `${k.bands.full} students` },
              { label: "Paid 50–99%", value: k.bands.over_half, display: `${k.bands.over_half} students` },
              { label: "Paid 1–49%", value: k.bands.under_half, display: `${k.bands.under_half} students` },
              { label: "Paid 0%", value: k.bands.nothing, display: `${k.bands.nothing} students` },
            ]}
          />
        </Card>
      </div>

      <Card className="mt-4" title="Students" description="Sortable, searchable and exportable. Click a name for the full Student 360.">
        <DataTable
          rows={students as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "father_name", "phone", "roll_no"]}
          filters={[
            { key: "fee_status", label: "Status", options: statusKeys.map((s) => ({ value: s, label: FEE_STATUS[s].label })) },
            ...(d.sections.length > 1 ? [{ key: "section", label: "Section", options: d.sections.map((s) => ({ value: s.section, label: s.section })) }] : []),
          ]}
          totals
          pageSize={100}
          exportName={`${d.class.name}-${d.session.name}`}
          exportMeta={[`${d.class.name} · Session ${d.session.name}`, arrears ? "Pending includes previous dues" : "Current session only"]}
          columns={[
            { key: "roll", label: "Roll" },
            { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
            { key: "father_name", label: "Father", hideOnMobile: true },
            { key: "expected", label: "Expected", type: "money", total: true },
            { key: "received", label: "Paid", type: "money", total: true },
            { key: "show_pending", label: "Pending", type: "money", total: true },
            { key: "show_overdue", label: "Overdue", type: "money", total: true, alertPositive: true },
            { key: "prev_pending", label: "Prev. dues", type: "money", total: true, dimZero: true, hideOnMobile: true },
            { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
            { key: "fee_status", label: "Status", type: "status" },
          ]}
        />
      </Card>
    </>
  );
}
