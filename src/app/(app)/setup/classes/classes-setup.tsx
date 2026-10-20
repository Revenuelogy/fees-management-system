"use client";

import { Info } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { AddClassRow, AddFeeHeadRow, ClassRow, FeeHeadRow, type ClassInfo, type FeeHeadInfo } from "./rows";
import { GRID } from "./grid";

export function ClassesSetup() {
  const { session: active } = useApp();
  const res = useApi<{ classes: ClassInfo[]; heads: FeeHeadInfo[] }>(apiUrl("/api/setup/classes", { session: active?.id }), { refreshInterval: 0 });
  if (!res.data) return <Pending queries={[res]} />;
  const { classes, heads } = res.data;
  const nextSort = classes.length ? Math.max(...classes.map((c) => c.sort_order)) + 1 : 1;
  const nextPriority = heads.length ? Math.ceil((Math.max(...heads.map((h) => h.priority)) + 1) / 10) * 10 : 10;

  return (
    <>
      <PageHeader
        title="Classes & fee heads"
        description="Shared by every session."
        info="Classes and the kinds of fees you charge are shared by all sessions. Inactive ones are hidden from new setups but kept for history."
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <Card title="Classes" description="Sort order sets the order classes are listed in, and which class students are promoted to next.">
          <div className={`${GRID} hidden border-b border-line pb-1.5 text-caption font-medium uppercase tracking-wide text-muted sm:grid`}>
            <span>Class</span>
            <span className="text-right">Order</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>
          <div className="divide-y divide-line">
            {classes.map((c) => (
              <ClassRow key={c.id} cls={c} sessionName={active?.name ?? null} />
            ))}
          </div>
          {classes.length === 0 && <p className="py-3 text-footnote text-ink-2">No classes yet. Add them in teaching order (Nursery, LKG, UKG, Class 1 …).</p>}
          <AddClassRow nextSort={nextSort} />
          <p className="mt-3 text-footnote text-muted">A class can only be deleted while no student has ever been enrolled in it.</p>
        </Card>

        <Card
          id="fee-heads"
          className="scroll-mt-20"
          title="Fee heads"
          description="Priority decides what a payment clears first when it does not say what it is for: lower numbers are cleared first."
        >
          <div className={`${GRID} hidden border-b border-line pb-1.5 text-caption font-medium uppercase tracking-wide text-muted sm:grid`}>
            <span>Fee head</span>
            <span className="text-right">Priority</span>
            <span>Status</span>
            <span className="sr-only">Actions</span>
          </div>
          <div className="divide-y divide-line">
            {heads.map((h) => (
              <FeeHeadRow key={h.id} head={h} />
            ))}
          </div>
          {heads.length === 0 && <p className="py-3 text-footnote text-ink-2">No fee heads yet. Typical ones: Tuition Fee, Annual Charges, Exam Fee, Transport Fee.</p>}
          <AddFeeHeadRow nextPriority={nextPriority} />
          <div className="mt-4 flex gap-2 rounded-2xl bg-fill-2 px-3 py-2.5 text-footnote text-ink-2">
            <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
            <p>
              Changing a priority re-runs payment allocation for every student automatically, so what past payments are shown as having
              paid for may shift between fee heads. Totals received never change. A fee head can only be deleted while it is unused;
              otherwise untick “Active”.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
