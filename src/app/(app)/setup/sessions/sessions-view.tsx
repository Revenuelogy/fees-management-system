"use client";

import { CalendarRange, Plus } from "lucide-react";
import { useApi } from "@/lib/api/hooks";
import { todayIST } from "@/lib/format";
import type { SessionSetupRow } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { addMonthsIso } from "@/lib/dates";
import { SessionPanel, type InstallmentInfo, type SessionInfo } from "./session-panel";
import { CreateSessionForm } from "./create-session-form";

export function SessionsView() {
  const { settings } = useApp();
  const res = useApi<SessionSetupRow[]>("/api/sessions", { refreshInterval: 0 });
  if (!res.data) return <Pending queries={[res]} />;

  const sessions: SessionInfo[] = res.data;
  const bySession = new Map<string, InstallmentInfo[]>(res.data.map((s) => [s.id, s.installments]));

  const startMonth = settings?.session_start_month ?? 4;
  const latestStart = sessions.length ? Math.max(...sessions.map((s) => Number(s.start_date.slice(0, 4)))) : null;
  const today = todayIST();
  const thisYearStart = Number(today.slice(5, 7)) >= startMonth ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const defaultYear = latestStart !== null ? latestStart + 1 : thisYearStart;

  return (
    <>
      <PageHeader
        title="Sessions & installments"
        description="Academic years and the dates fees fall due."
        info="Each session has its own installments. Names and due dates can change at any time; an installment can only be removed while no student has fees assigned on it."
        actions={
          <LinkButton href="#new-session" variant="primary">
            <Plus className="size-4" aria-hidden /> New session
          </LinkButton>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <Card>
              <Empty title="No sessions yet" icon={CalendarRange}>
                Create the first session with the form on this page. A session usually runs April to March.
              </Empty>
            </Card>
          ) : (
            sessions.map((s) => {
              const inst = bySession.get(s.id) ?? [];
              const last = inst[inst.length - 1];
              const nextNumber = (last?.number ?? 0) + 1;
              return (
                <SessionPanel
                  key={s.id}
                  session={s}
                  installments={inst}
                  nextInstallment={{
                    number: nextNumber,
                    name: `Installment ${nextNumber}`,
                    due_date: last ? addMonthsIso(last.due_date, 1) : s.start_date,
                  }}
                />
              );
            })
          )}
        </div>
        <Card
          id="new-session"
          title="New session"
          description="Creates the session with its installments, and can copy last year's fee structure so you only adjust the amounts."
          className="scroll-mt-20 xl:sticky xl:top-20"
        >
          <CreateSessionForm
            sessions={sessions.map((s) => ({ id: s.id, name: s.name, start_date: s.start_date, end_date: s.end_date }))}
            startMonth={startMonth}
            defaultYear={defaultYear}
          />
        </Card>
      </div>
    </>
  );
}
