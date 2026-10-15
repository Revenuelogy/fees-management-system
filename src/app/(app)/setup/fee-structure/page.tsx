import Link from "next/link";
import { CheckCircle2, Circle, Coins } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getActiveSession, getClasses, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import type { FeeHead, Installment, ReconciliationCheck } from "@/lib/types";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { NoSession } from "@/components/no-session";
import { embeddedCount, fetchAll } from "../_lib/fetch-all";
import { FeeStructureEditor } from "./editor";

export const metadata = { title: "Fee structure" };


export default async function FeeStructurePage({ searchParams }: PageProps<"/setup/fee-structure">) {
  await requireWriter();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;

  const supabase = await createClient();
  const [classes, instRes, headsRes] = await Promise.all([
    getClasses(),
    supabase.from("installments").select("*").eq("session_id", session.id).order("number"),
    supabase.from("fee_heads").select("*").order("priority").order("name"),
  ]);
  const installments = (instRes.data ?? []) as Installment[];
  const allHeads = (headsRes.data ?? []) as FeeHead[];
  const activeClasses = classes.filter((c) => c.is_active);
  const selected = classes.find((c) => c.id === param(sp.class)) ?? activeClasses[0] ?? null;

  const header = (
    <PageHeader
      title="Fee structure"
      description={
        <>
          What each class pays in <b className="text-ink">{session.name}</b>.
        </>
      }
      info="Amounts per installment and fee head. Switch session in the top bar."
    />
  );

  if (installments.length === 0 || !selected || allHeads.length === 0) {
    const missing =
      installments.length === 0
        ? { title: `${session.name} has no installments yet`, body: "Add the installments (due dates) first.", href: "/setup/sessions", label: "Sessions & installments" }
        : !selected
          ? { title: "No classes yet", body: "Add your classes first.", href: "/setup/classes", label: "Classes & fee heads" }
          : { title: "No fee heads yet", body: "Add fee heads such as Tuition Fee first.", href: "/setup/classes#fee-heads", label: "Classes & fee heads" };
    return (
      <>
        {header}
        <Card>
          <Empty title={missing.title} icon={Coins}>
            {missing.body}
            <div className="mt-4">
              <LinkButton href={missing.href} variant="primary">
                {missing.label}
              </LinkButton>
            </div>
          </Empty>
        </Card>
      </>
    );
  }

  const instIds = installments.map((i) => i.id);
  const [cellsRes, countsRes, enrolled, reconRes] = await Promise.all([
    supabase.from("fee_structures").select("installment_id, fee_head_id, amount").eq("class_id", selected.id).in("installment_id", instIds),
    supabase.from("classes").select("id, fee_structures(count)").in("fee_structures.installment_id", instIds).gt("fee_structures.amount", 0),
    fetchAll<{ student_id: string; students: { student_charges: unknown } }>((from, to) =>
      supabase
        .from("enrollments")
        .select("student_id, students!inner(status, student_charges(count))")
        .eq("session_id", session.id)
        .eq("class_id", selected.id)
        .eq("students.status", "active")
        .eq("students.student_charges.session_id", session.id)
        .order("id")
        .range(from, to),
    ),
    supabase.rpc("reconciliation", { p_session: session.id }),
  ]);

  const amounts: Record<string, number> = {};
  for (const c of (cellsRes.data ?? []) as { installment_id: string; fee_head_id: string; amount: number }[]) {
    amounts[`${c.fee_head_id}|${c.installment_id}`] = Number(c.amount);
  }
  const hasStructure = new Set(
    ((countsRes.data ?? []) as { id: string; fee_structures: unknown }[]).filter((c) => embeddedCount(c.fee_structures) > 0).map((c) => c.id),
  );
  // active heads, plus any inactive head that still has amounts for this class
  const heads = allHeads.filter((h) => h.is_active || installments.some((i) => (amounts[`${h.id}|${i.id}`] ?? 0) > 0));
  const withCharges = enrolled.filter((e) => embeddedCount(e.students?.student_charges) > 0).length;
  const checks = ((reconRes.data as { checks?: ReconciliationCheck[] } | null)?.checks ?? []) as ReconciliationCheck[];
  const noPlan = checks.find((c) => c.key === "enrolled_without_plan");

  const pills = classes.filter((c) => c.is_active || c.id === selected.id || hasStructure.has(c.id));

  return (
    <>
      {header}
      <nav aria-label="Classes" className="mb-4 flex flex-wrap gap-1.5">
        {pills.map((c) => {
          const on = c.id === selected.id;
          const done = hasStructure.has(c.id);
          const Icon = done ? CheckCircle2 : Circle;
          return (
            <Link
              key={c.id}
              href={`/setup/fee-structure?class=${c.id}`}
              scroll={false}
              aria-current={on ? "page" : undefined}
              title={done ? `${c.name}: amounts set` : `${c.name}: no amounts yet`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-footnote font-medium transition-colors",
                on ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
              )}
            >
              <Icon className={cn("size-3.5", on ? "text-accent-ink" : done ? "text-good" : "text-muted")} aria-hidden />
              {c.name}
              {!c.is_active && <span className="text-[11px] opacity-80">(inactive)</span>}
            </Link>
          );
        })}
      </nav>
      <FeeStructureEditor
        key={`${session.id}:${selected.id}`}
        sessionId={session.id}
        sessionName={session.name}
        cls={{ id: selected.id, name: selected.name }}
        installments={installments.map((i) => ({ id: i.id, number: i.number, name: i.name, due_date: i.due_date }))}
        heads={heads.map((h) => ({ id: h.id, name: h.name, priority: h.priority, is_active: h.is_active }))}
        amounts={amounts}
        otherClasses={classes
          .filter((c) => c.id !== selected.id && (c.is_active || hasStructure.has(c.id)))
          .map((c) => ({ id: c.id, name: c.name, hasStructure: hasStructure.has(c.id) }))}
        stats={{ enrolled: enrolled.length, withCharges, sessionWithoutPlan: noPlan ? Number(noPlan.left ?? 0) : null }}
      />
    </>
  );
}
