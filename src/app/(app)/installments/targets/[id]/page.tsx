import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, pct, rupeesShort } from "@/lib/format";
import type { TargetProgress } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { BarList } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";

export const metadata = { title: "Target tracker" };

export default async function TargetPage({ params }: PageProps<"/installments/targets/[id]">) {
  await requireStaff();
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("target_progress", { p_target: id });
  if (error?.message?.includes("Unknown target") || (!error && !data)) notFound();
  if (error) throw new Error(error.message);
  const p = data as TargetProgress;
  const t = p.target;

  return (
    <>
      <PageHeader
        title={t.name}
        description={`Collect ${Number(t.target_pct)}% of the fees that fall due on or before ${fmtDate(t.target_date)}.`}
        crumbs={[{ label: "Installments", href: "/installments" }, { label: "Target tracker" }]}
      />
      <KpiGrid cols={4}>
        <Kpi label="Fees due by target date" value={rupeesShort(p.expected)} />
        <Kpi label="Goal" value={rupeesShort(p.goal)} sub={`${Number(t.target_pct)}% of due fees`} />
        <Kpi label="Collected so far" value={rupeesShort(p.received)} meter={p.current_pct} sub={`${pct(p.current_pct)} of due fees`} />
        <Kpi label="Gap to target" value={rupeesShort(p.gap)} tone={p.gap > 0 ? "critical" : "good"} sub={p.gap > 0 ? `${p.students_to_close.length} students below close it` : "Target reached"} />
      </KpiGrid>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Students whose payment closes the gap"
          description="Largest balances first; the list stops once their dues add up to the gap."
        >
          <DataTable
            rows={p.students_to_close as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "phone", "class_name"]}
            totals
            exportName="target-call-list"
            exportMeta={[t.name, `Gap ${rupeesShort(p.gap)}`]}
            columns={[
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: "phone", label: "Phone" },
              { key: "remaining", label: "Owes (due by target date)", type: "money", total: true, alertPositive: true },
              { key: "cumulative", label: "Running total", type: "money" },
            ]}
            empty="The target has been reached."
          />
        </Card>
        <Card title="Where the remaining dues sit" description="Unpaid fees due by the target date, by class.">
          <BarList rows={p.classes.map((c) => ({ label: c.class_name, value: c.remaining, display: rupeesShort(c.remaining), sub: `${c.students} students` }))} />
        </Card>
      </div>
    </>
  );
}
