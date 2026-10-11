import { Info } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getActiveSession } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { embeddedCount } from "../_lib/fetch-all";
import { AddClassRow, AddFeeHeadRow, ClassRow, FeeHeadRow, type ClassInfo, type FeeHeadInfo } from "./rows";
import { GRID } from "./grid";

export const metadata = { title: "Classes & fee heads" };

export default async function ClassesSetupPage() {
  await requireWriter();
  const supabase = await createClient();
  const active = await getActiveSession();

  const classQuery = supabase
    .from("classes")
    .select("id, name, sort_order, is_active, enrollments(count), in_session:enrollments(count), fee_structures(count)")
    .order("sort_order")
    .order("name");
  const [classesRes, headsRes] = await Promise.all([
    active ? classQuery.eq("in_session.session_id", active.id) : classQuery,
    supabase
      .from("fee_heads")
      .select("id, name, priority, is_active, student_charges(count), fee_structures(count)")
      .order("priority")
      .order("name"),
  ]);
  if (classesRes.error) throw new Error(classesRes.error.message);
  if (headsRes.error) throw new Error(headsRes.error.message);

  const classes: ClassInfo[] = (classesRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    sort_order: c.sort_order,
    is_active: c.is_active,
    enrolments: embeddedCount(c.enrollments),
    inSession: active ? embeddedCount(c.in_session) : 0,
    structure: embeddedCount(c.fee_structures),
  }));
  const heads: FeeHeadInfo[] = (headsRes.data ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    priority: h.priority,
    is_active: h.is_active,
    charges: embeddedCount(h.student_charges),
    structure: embeddedCount(h.fee_structures),
  }));
  const nextSort = classes.length ? Math.max(...classes.map((c) => c.sort_order)) + 1 : 1;
  const nextPriority = heads.length ? Math.ceil((Math.max(...heads.map((h) => h.priority)) + 1) / 10) * 10 : 10;

  return (
    <>
      <PageHeader
        title="Classes & fee heads"
        crumbs={[{ label: "Setup", href: "/setup" }, { label: "Classes & fee heads" }]}
        description="The list of classes and the kinds of fees you charge. Both are shared by all sessions; inactive ones are hidden from new setups but kept for history."
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title="Classes" description="Sort order sets the order classes are listed in, and which class students are promoted to next.">
          <div className={`${GRID} hidden border-b border-line pb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted sm:grid`}>
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
          {classes.length === 0 && <p className="py-3 text-[13px] text-ink-2">No classes yet. Add them in teaching order (Nursery, LKG, UKG, Class 1 …).</p>}
          <AddClassRow nextSort={nextSort} />
          <p className="mt-3 text-[12.5px] text-muted">A class can only be deleted while no student has ever been enrolled in it.</p>
        </Card>

        <Card
          id="fee-heads"
          className="scroll-mt-20"
          title="Fee heads"
          description="Priority decides what a payment clears first when it does not say what it is for: lower numbers are cleared first."
        >
          <div className={`${GRID} hidden border-b border-line pb-1.5 text-[12px] font-medium uppercase tracking-wide text-muted sm:grid`}>
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
          {heads.length === 0 && <p className="py-3 text-[13px] text-ink-2">No fee heads yet. Typical ones: Tuition Fee, Annual Charges, Exam Fee, Transport Fee.</p>}
          <AddFeeHeadRow nextPriority={nextPriority} />
          <div className="mt-4 flex gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-ink-2">
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
