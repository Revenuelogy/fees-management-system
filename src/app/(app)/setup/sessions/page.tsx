import { CalendarRange, Plus } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getSettings } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { LinkButton } from "@/components/ui/button";
import { embeddedCount } from "../_lib/fetch-all";
import { addMonthsIso } from "../_lib/dates";
import { SessionPanel, type InstallmentInfo, type SessionInfo } from "./session-panel";
import { CreateSessionForm } from "./create-session-form";

export const metadata = { title: "Sessions & installments" };

type SessionRow = Omit<SessionInfo, "enrollments" | "payments" | "charges"> & {
  enrollments: unknown;
  payments: unknown;
  student_charges: unknown;
};
type InstallmentRowDb = Omit<InstallmentInfo, "charges"> & { session_id: string; student_charges: unknown };

export default async function SessionsPage() {
  await requireWriter();
  const supabase = await createClient();
  const [sessionsRes, instRes, settings] = await Promise.all([
    supabase
      .from("academic_sessions")
      .select("id, name, start_date, end_date, is_current, enrollments(count), payments!payments_session_id_fkey(count), student_charges(count)")
      .order("start_date", { ascending: false }),
    supabase.from("installments").select("id, session_id, number, name, due_date, student_charges(count)").order("number"),
    getSettings(),
  ]);
  if (sessionsRes.error) throw new Error(sessionsRes.error.message);

  const sessions: SessionInfo[] = ((sessionsRes.data ?? []) as SessionRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    start_date: s.start_date,
    end_date: s.end_date,
    is_current: s.is_current,
    enrollments: embeddedCount(s.enrollments),
    payments: embeddedCount(s.payments),
    charges: embeddedCount(s.student_charges),
  }));
  const bySession = new Map<string, InstallmentInfo[]>();
  for (const i of (instRes.data ?? []) as InstallmentRowDb[]) {
    const list = bySession.get(i.session_id) ?? [];
    list.push({ id: i.id, number: i.number, name: i.name, due_date: i.due_date, charges: embeddedCount(i.student_charges) });
    bySession.set(i.session_id, list);
  }

  const startMonth = settings?.session_start_month ?? 4;
  const latestStart = sessions.length ? Math.max(...sessions.map((s) => Number(s.start_date.slice(0, 4)))) : null;
  const today = todayIST();
  const thisYearStart = Number(today.slice(5, 7)) >= startMonth ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const defaultYear = latestStart !== null ? latestStart + 1 : thisYearStart;

  return (
    <>
      <PageHeader
        title="Sessions & installments"
        crumbs={[{ label: "Setup", href: "/setup" }, { label: "Sessions & installments" }]}
        description="Each academic session has its own installments (the dates fees fall due). Change names and due dates here at any time; an installment can only be removed while nobody is billed against it."
        actions={
          <LinkButton href="#new-session" variant="primary">
            <Plus className="size-4" aria-hidden /> New session
          </LinkButton>
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
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
