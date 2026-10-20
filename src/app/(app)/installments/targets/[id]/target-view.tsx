"use client";

import { useApi } from "@/lib/api/hooks";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, rupeesShort } from "@/lib/format";
import type { TargetProgress } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { BarList } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { Ring } from "@/components/ui/ring";

export function TargetView({ id }: { id: string }) {
  const res = useApi<TargetProgress>(`/api/targets/${encodeURIComponent(id)}`);
  if (!res.data) return <Pending queries={[res]} />;
  const p = res.data;
  const t = p.target;
  const reached = p.gap <= 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${Number(t.target_pct)}% by ${fmtDate(t.target_date)}`}
        description="Share of fees due by that date that should be collected"
        crumbs={[{ label: "Installments", href: "/installments" }]}
      />
      <section className="rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <Ring value={p.current_pct} size={168} stroke={16} color={reached ? "var(--good)" : "var(--series-1)"} className="self-center">
            <span className="figure text-[32px] leading-none">{Math.round(p.current_pct ?? 0)}%</span>
            <span className="mt-1 text-footnote text-ink-2">of {Number(t.target_pct)}% goal</span>
          </Ring>
          <div className="grid flex-1 grid-cols-2 gap-6 lg:grid-cols-4">
            {[
              ["Due by then", rupeesShort(p.expected), ""],
              ["Goal", rupeesShort(p.goal), ""],
              ["Collected", rupeesShort(p.received), ""],
              ["Still needed", reached ? "Reached" : rupeesShort(p.gap), reached ? "text-good-ink" : "text-critical-ink"],
            ].map(([l, v, c]) => (
              <div key={l}>
                <p className="text-footnote text-ink-2">{l}</p>
                <p className={`figure mt-1 text-title1 ${c}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Who closes the gap"
          subtitle={reached ? undefined : `${p.students_to_close.length} students, largest balances first`}
          description="The list stops once these students' dues add up to the gap."
        >
          <DataTable
            rows={p.students_to_close.map((s) => ({ ...s, who: `${s.class_name}${s.phone ? " · " + s.phone : ""}` })) as unknown as Record<string, unknown>[]}
            searchKeys={["full_name", "admission_no", "phone", "class_name"]}
            totals
            pageSize={20}
            exportName="target-call-list"
            exportMeta={[t.name, `Gap ${rupeesShort(p.gap)}`]}
            columns={[
              { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
              { key: "remaining", label: "Owes", type: "money", total: true, alertPositive: true },
              { key: "cumulative", label: "Running total", type: "money", hideOnMobile: true },
            ]}
            empty="The target has been reached."
          />
        </Card>
        <Card title="By class" description="Unpaid fees due by the target date, per class.">
          <BarList compact color="bg-critical" rows={p.classes.map((c) => ({ label: c.class_name, value: c.remaining, display: rupeesShort(c.remaining), sub: `${c.students}` }))} />
        </Card>
      </div>
    </div>
  );
}
