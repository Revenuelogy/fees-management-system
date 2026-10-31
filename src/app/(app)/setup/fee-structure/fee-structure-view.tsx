"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Coins } from "lucide-react";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import type { FeeStructureData } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { NoSession } from "@/components/no-session";
import { FeeStructureEditor } from "./editor";

export function FeeStructureView({ sp }: { sp: SearchParams }) {
  const { session, classes } = useApp();
  const activeClasses = classes.filter((c) => c.is_active);
  const selected = classes.find((c) => c.id === param(sp.class)) ?? activeClasses[0] ?? null;
  const res = useApi<FeeStructureData>(session && selected ? apiUrl("/api/fee-structure", { session: session.id, class: selected.id }) : null, {
    refreshInterval: 0,
  });
  if (!session) return <NoSession />;
  if (selected && !res.data) return <Pending queries={[res]} />;
  const installments = res.data?.installments ?? [];
  const allHeads = res.data?.heads ?? [];

  const header = (
    <PageHeader
      title="Fee structure"
      description={
        <>
          What each class pays in <b className="text-ink">{session.name}</b>.
        </>
      }
      info="Amounts per installment and fee type. Switch session in the top bar."
    />
  );

  if (installments.length === 0 || !selected || allHeads.length === 0 || !res.data) {
    const missing =
      installments.length === 0
        ? { title: `${session.name} has no installments yet`, body: "Add the installments (due dates) first.", href: "/setup/sessions", label: "Sessions & installments" }
        : !selected
          ? { title: "No classes yet", body: "Add your classes first.", href: "/setup/classes", label: "Classes & fee types" }
          : { title: "No fee types yet", body: "Add fee types such as Tuition Fee first.", href: "/setup/classes#fee-heads", label: "Classes & fee types" };
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

  const { amounts, enrolled, with_charges: withCharges, no_plan: noPlan } = res.data;
  const hasStructure = new Set(res.data.classes_with_structure);
  // active heads, plus any inactive head that still has amounts for this class
  const heads = allHeads.filter((h) => h.is_active || installments.some((i) => (amounts[`${h.id}|${i.id}`] ?? 0) > 0));

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
        stats={{ enrolled, withCharges, sessionWithoutPlan: noPlan ? Number(noPlan.left ?? 0) : null }}
      />
    </>
  );
}
