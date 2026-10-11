import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { getActiveSession } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, num, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { InstallmentDetail } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { BarList } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { NoSession } from "@/components/no-session";

export const metadata = { title: "Installment" };

const GROUP_LABEL = {
  full: "Paid in full",
  over_half: "Paid more than half",
  under_half: "Paid less than half",
  nothing: "Paid nothing",
} as const;

const TIMING_LABEL = {
  on_time: "On or before due date",
  late_15: "1–15 days late",
  late_30: "16–30 days late",
  late_30_plus: "Over 30 days late",
} as const;

export default async function InstallmentPage({ params }: PageProps<"/installments/[number]">) {
  await requireStaff();
  const { number } = await params;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const supabase = await createClient();
  const { data: inst } = await supabase
    .from("installments")
    .select("id, number, name")
    .eq("session_id", session.id)
    .eq("number", Number(number))
    .maybeSingle();
  if (!inst) notFound();
  const { data: siblings } = await supabase.from("installments").select("number, name").eq("session_id", session.id).order("number");

  const { data, error } = await supabase.rpc("installment_detail", { p_installment: inst.id });
  if (error || !data) throw new Error(error?.message ?? "Could not load installment");
  const d = data as InstallmentDetail;
  const s = d.summary;
  const isDue = d.installment.due_date <= d.today;
  const topHalf = d.students.filter((x) => x.in_top_half);
  const topHalfGap = topHalf.reduce((a, x) => a + x.gap, 0);
  const timingTotal = d.timing.reduce((a, t) => a + t.amount, 0);

  return (
    <>
      <PageHeader
        title={d.installment.name}
        description={`Session ${session.name} · due ${fmtDate(d.installment.due_date)}${d.installment.next_due ? ` · next installment due ${fmtDate(d.installment.next_due)}` : ""}`}
        crumbs={[{ label: session.name, href: "/" }, { label: "Installments", href: "/installments" }, { label: d.installment.name }]}
        actions={
          <div className="flex flex-wrap gap-1">
            {(siblings ?? []).map((x) => (
              <Link
                key={x.number}
                href={`/installments/${x.number}`}
                className={`rounded-lg border px-2.5 py-1.5 text-[13px] ${x.number === d.installment.number ? "border-accent bg-accent-soft font-medium text-accent-strong" : "border-line-strong bg-surface hover:bg-surface-2"}`}
              >
                Inst {x.number}
              </Link>
            ))}
          </div>
        }
      />

      <KpiGrid cols={5}>
        <Kpi label="Expected" value={rupeesShort(s.expected)} sub={`${num(s.students)} students after concessions`} />
        <Kpi label="Received so far" value={rupeesShort(s.received)} meter={s.collection_pct} sub={`${pct(s.collection_pct)} collected`} />
        <Kpi label="Gap" value={rupeesShort(s.gap)} tone={s.gap > 0 && isDue ? "critical" : "default"} sub={isDue ? "Overdue" : "Not yet due"} />
        <Kpi label="Paid on time" value={pct(s.on_time_pct)} sub={`${rupeesShort(s.on_time)} by the due date · ${rupeesShort(s.late)} late`} />
        <Kpi
          label="Late catch-up"
          value={rupeesShort(d.catch_up.amount)}
          sub={
            d.catch_up.next_due
              ? `Paid after the next installment fell due (${fmtDate(d.catch_up.next_due)}) · ${d.catch_up.payments} payments. Delayed, not lost.`
              : "This is the last installment of the session."
          }
        />
      </KpiGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Gap by class" description="Unpaid amount of this installment per class, with each class's share of the total gap.">
          <BarList
            rows={[...d.classes]
              .filter((c) => c.gap > 0)
              .sort((a, b) => b.gap - a.gap)
              .map((c) => ({
                label: c.class_name,
                value: c.gap,
                display: rupeesShort(c.gap),
                sub: `${pct(c.share_of_gap)} of gap · ${c.students_unpaid} students`,
                href: c.class_id ? `/classes/${c.class_id}` : undefined,
              }))}
          />
        </Card>
        <Card title="Gap by student group" description="Students grouped by how much of this installment they have paid.">
          <ul className="divide-y divide-line">
            {d.groups.map((g) => (
              <li key={g.group} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <div className="text-[14px] font-medium text-ink">{GROUP_LABEL[g.group]}</div>
                  <div className="text-[12.5px] text-muted">
                    {num(g.students)} students · {pct(ratioPct(g.students, s.students), 0)} of students billed
                  </div>
                </div>
                <div className="text-right tabular">
                  <div className={`text-[15px] font-semibold ${g.missing > 0 ? "text-ink" : "text-muted"}`}>{rupees(g.missing)}</div>
                  <div className="text-[12.5px] text-muted">missing · {pct(ratioPct(g.missing, s.gap), 0)} of gap</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Who to call first"
          description={
            topHalf.length > 0
              ? `${topHalf.length} students (${pct(ratioPct(topHalf.length, d.students.length), 0)} of those who owe) hold ${rupeesShort(topHalfGap)} — half of the gap. Recovering from them first closes the gap fastest.`
              : "Nobody owes anything for this installment."
          }
        >
          <DataTable
            rows={topHalf as unknown as Record<string, unknown>[]}
            pageSize={15}
            exportName={`inst-${d.installment.number}-top-half`}
            exportMeta={[`${d.installment.name} · ${session.name}`, "Smallest set of students holding 50% of the gap"]}
            columns={[
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: "phone", label: "Phone", hideOnMobile: true },
              { key: "expected", label: "Expected", type: "money" },
              { key: "received", label: "Paid", type: "money", dimZero: true },
              { key: "gap", label: "Gap", type: "money", alertPositive: true },
              { key: "cumulative_pct", label: "Cum. % of gap", type: "pct" },
            ]}
          />
        </Card>
        <Card title="When the money arrived" description="Payments for this installment relative to its due date.">
          <BarList
            labelWidth="w-36"
            rows={d.timing.map((t) => ({
              label: TIMING_LABEL[t.bucket],
              value: t.amount,
              display: rupeesShort(t.amount),
              sub: `${pct(ratioPct(t.amount, timingTotal), 0)} · ${t.payments}`,
            }))}
          />
        </Card>
      </div>

      <Card className="mt-4" title="Every student with a gap" description="All students who still owe part of this installment.">
        <DataTable
          rows={d.students as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "phone", "class_name"]}
          filters={[
            { key: "class_name", label: "Class", options: d.classes.map((c) => ({ value: c.class_name, label: c.class_name })) },
            {
              key: "group",
              label: "Group",
              options: [
                { value: "over_half", label: GROUP_LABEL.over_half },
                { value: "under_half", label: GROUP_LABEL.under_half },
                { value: "nothing", label: GROUP_LABEL.nothing },
              ],
            },
          ]}
          totals
          pageSize={25}
          exportName={`inst-${d.installment.number}-gaps`}
          exportMeta={[`${d.installment.name} · ${session.name}`, "Students with a gap"]}
          columns={[
            { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
            { key: "class_name", label: "Class", sub: "section" },
            { key: "phone", label: "Phone", hideOnMobile: true },
            { key: "expected", label: "Expected", type: "money", total: true },
            { key: "received", label: "Paid", type: "money", total: true, dimZero: true },
            { key: "gap", label: "Gap", type: "money", total: true, alertPositive: true },
          ]}
          defaultSort={{ key: "gap", dir: "desc" }}
        />
      </Card>
    </>
  );
}
