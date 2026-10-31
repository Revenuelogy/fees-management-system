"use client";

import { ArrowRight, CalendarRange, CheckCircle2, Users } from "lucide-react";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import type { PromotePreview } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { plural } from "@/lib/text";
import { PromoteForm, SessionPicker, type PromoteRow } from "./promote-form";

const DESCRIPTION = "Move last year's students up a class in one go.";
const INFO = "Each class maps to a target class in the next session; the final class usually passes out.";

export function PromoteView({ sp }: { sp: SearchParams }) {
  const { sessions, session: active, classes } = useApp();
  const asc = [...sessions].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const to = sessions.find((s) => s.id === param(sp.to)) ?? active ?? asc[asc.length - 1];
  const toIdx = asc.findIndex((s) => s.id === to?.id);
  const from = sessions.find((s) => s.id === param(sp.from)) ?? (toIdx > 0 ? asc[toIdx - 1] : undefined) ?? asc.find((s) => s.id !== to?.id);
  const res = useApi<PromotePreview>(sessions.length >= 2 && from && to ? apiUrl("/api/promote", { from: from.id, to: to.id }) : null, {
    refreshInterval: 0,
  });

  if (sessions.length < 2 || !from || !to) {
    return (
      <>
        <PageHeader title="Promote students" description={DESCRIPTION} info={INFO} />
        <Card>
          <Empty title="You need two sessions to promote students" icon={CalendarRange}>
            Create the new session first (with its installments and fee structure), then come back here.
            <div className="mt-4">
              <LinkButton href="/setup/sessions#new-session" variant="primary">
                Create a session
              </LinkButton>
            </div>
          </Empty>
        </Card>
      </>
    );
  }

  if (!res.data) return <Pending queries={[res]} />;
  const hasStructure = new Set(res.data.target_has_structure);
  const byClass = new Map(res.data.by_class.map(({ class_id, ...g }) => [class_id, g]));

  const activeClasses = classes.filter((c) => c.is_active);
  const rows: PromoteRow[] = classes
    .filter((c) => byClass.has(c.id))
    .map((c) => {
      const next = activeClasses.filter((x) => x.sort_order > c.sort_order).sort((a, b) => a.sort_order - b.sort_order)[0];
      const g = byClass.get(c.id)!;
      return {
        class_id: c.id,
        class_name: c.name,
        ...g,
        defaultTarget: next ? next.id : "passed",
      };
    });
  const activeTotal = rows.reduce((s, r) => s + r.active, 0);
  const alreadyTotal = rows.reduce((s, r) => s + r.already, 0);
  const targets = classes
    .filter((c) => c.is_active)
    .map((c) => ({ id: c.id, name: c.name, hasStructure: hasStructure.has(c.id) }));

  return (
    <>
      <PageHeader title="Promote students" description={DESCRIPTION} info={INFO} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              {from.name} <ArrowRight className="size-4 text-muted" aria-hidden /> {to.name}
            </span>
          }
          description={
            from.start_date > to.start_date
              ? `Careful: ${from.name} is later than ${to.name}.`
              : `${plural(activeTotal, "active student")} in ${from.name} · ${plural(res.data.target_enrolled, "student")} already enrolled in ${to.name}`
          }
        >
          <div className="mb-4">
            <SessionPicker sessions={asc.map((s) => ({ id: s.id, name: s.name })).reverse()} fromId={from.id} toId={to.id} />
          </div>
          {from.id === to.id ? (
            <p className="text-footnote text-critical-ink">Choose two different sessions.</p>
          ) : rows.length === 0 ? (
            <Empty title={`Nobody is enrolled in ${from.name}`} icon={Users}>
              Pick another “from” session, or import students instead.
            </Empty>
          ) : (
            <PromoteForm
              key={`${from.id}:${to.id}`}
              fromId={from.id}
              toId={to.id}
              fromName={from.name}
              toName={to.name}
              rows={rows}
              targets={targets}
            />
          )}
        </Card>
        <Card title="Good to know">
          <ul className="space-y-3 text-subhead text-ink-2">
            {[
              "Only active students move.",
              "Sections are kept; roll numbers start empty.",
              `Safe to re-run: ${plural(alreadyTotal, "student")} already in ${to.name} stay as they are.`,
              `Unpaid ${from.name} fees follow each student as past year due.`,
              "“Passed out” students leave the active list.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
