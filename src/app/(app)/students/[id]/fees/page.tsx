import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, IndianRupee, Pencil } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getActiveSession, getSessions, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, rupees, rupeesShort } from "@/lib/format";
import type { DueLine, FeeHead, Installment, Student } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { NoSession } from "@/components/no-session";
import { STUDENT_STATUS_LABELS, isUuid } from "../../helpers";
import { FeePlan, type PlanGroup } from "./fee-plan";
import { ConcessionTool, OpeningDueTool, RegenerateTool } from "./fee-tools";

export const metadata = { title: "Fee plan" };

type EnrollmentRow = { session_id: string; section: string; roll_no: string | null; class_id: string; classes: { name: string } | null };

export default async function StudentFeesPage({ params, searchParams }: PageProps<"/students/[id]/fees">) {
  await requireWriter();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();

  const [sessions, active] = await Promise.all([getSessions(), getActiveSession()]);
  if (!active) return <NoSession />;
  const requested = param(sp.session);
  const session = sessions.find((s) => s.id === requested) ?? active;

  const supabase = await createClient();
  const [studentRes, enrolRes, duesRes, metaRes, instRes, headsRes, advRes] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    supabase.from("enrollments").select("session_id, section, roll_no, class_id, classes(name)").eq("student_id", id),
    supabase.rpc("student_dues", { p_student: id }),
    supabase.from("student_charges").select("id, source, note").eq("student_id", id),
    supabase.from("installments").select("*").eq("session_id", session.id).order("number"),
    supabase.from("fee_heads").select("*").order("priority").order("name"),
    supabase.from("allocations").select("amount").eq("student_id", id).is("charge_id", null),
  ]);
  if (studentRes.error) throw new Error(studentRes.error.message);
  const student = studentRes.data as Student | null;
  if (!student) notFound();
  if (duesRes.error) throw new Error(duesRes.error.message);

  const enrollments = (enrolRes.data ?? []) as unknown as EnrollmentRow[];
  const dues = (duesRes.data ?? []) as DueLine[];
  const meta = new Map(((metaRes.data ?? []) as { id: string; source: string; note: string | null }[]).map((m) => [m.id, m]));
  const installments = (instRes.data ?? []) as Installment[];
  const heads = (headsRes.data ?? []) as FeeHead[];
  const advance = ((advRes.data ?? []) as { amount: number }[]).reduce((s, a) => s + Number(a.amount), 0);

  const enrolHere = enrollments.find((e) => e.session_id === session.id) ?? null;
  const enrolActive = enrollments.find((e) => e.session_id === active.id) ?? null;
  const lines = dues.filter((d) => d.session_id === session.id);

  // Group this session's lines by installment (every installment shown, even if empty).
  const groups: PlanGroup[] = installments.map((i) => ({
    installment_id: i.id,
    number: i.number,
    name: i.name,
    due_date: i.due_date,
    lines: lines
      .filter((l) => l.installment_id === i.id)
      .map((l) => ({
        charge_id: l.charge_id,
        fee_head: l.fee_head,
        amount: l.amount,
        concession: l.concession,
        net: l.net_amount,
        paid: l.paid,
        remaining: l.remaining,
        is_overdue: l.is_overdue,
        source: meta.get(l.charge_id)?.source ?? "structure",
        note: meta.get(l.charge_id)?.note ?? null,
      })),
  }));

  const sum = (key: "amount" | "concession" | "net_amount" | "paid" | "remaining", rows: DueLine[]) =>
    rows.reduce((s, r) => s + Number(r[key]), 0);
  const totals = {
    gross: sum("amount", lines),
    concession: sum("concession", lines),
    net: sum("net_amount", lines),
    paid: sum("paid", lines),
    remaining: sum("remaining", lines),
    overdue: sum("remaining", lines.filter((l) => l.is_overdue)),
  };

  // Remaining in other sessions, for context (e.g. previous dues).
  const otherSessions = sessions
    .filter((s) => s.id !== session.id)
    .map((s) => ({ session: s, remaining: sum("remaining", dues.filter((d) => d.session_id === s.id)), lines: dues.filter((d) => d.session_id === s.id).length }))
    .filter((x) => x.lines > 0);

  const base = `/students/${student.id}/fees`;
  const orderedSessions = [...sessions].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const defaultOpeningSession =
    [...orderedSessions].reverse().find((s) => s.start_date < active.start_date)?.id ?? session.id;

  return (
    <>
      <PageHeader
        title={`Fee plan · ${student.full_name}`}
        crumbs={[
          { label: "Students", href: "/students" },
          { label: student.full_name, href: `/students/${student.id}` },
          { label: "Fee plan" },
        ]}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Adm. no {student.admission_no}</span>
            <span>
              ·{" "}
              {enrolActive
                ? `${enrolActive.classes?.name ?? "?"} – ${enrolActive.section}${enrolActive.roll_no ? `, roll ${enrolActive.roll_no}` : ""} in ${active.name}`
                : `Not enrolled in ${active.name}`}
            </span>
            {student.father_name && <span>· Father {student.father_name}</span>}
            {student.status !== "active" && (
              <Badge tone="neutral">
                {STUDENT_STATUS_LABELS[student.status]}
                {student.left_on ? ` · ${fmtDate(student.left_on)}` : ""}
              </Badge>
            )}
          </span>
        }
        actions={
          <>
            <LinkButton href={`/students/${student.id}`}>
              <ExternalLink className="size-4" /> Student 360
            </LinkButton>
            <LinkButton href={`/students/${student.id}/edit`}>
              <Pencil className="size-4" /> Edit details
            </LinkButton>
            <LinkButton href={`/collect/${student.id}`} variant="primary">
              <IndianRupee className="size-4" /> Collect fee
            </LinkButton>
          </>
        }
      >
        <Segmented
          label="Session"
          options={orderedSessions.map((s) => ({
            label: s.name,
            href: s.id === active.id ? base : withParams(base, { session: s.id }),
            active: s.id === session.id,
          }))}
        />
      </PageHeader>

      <KpiGrid cols={5}>
        <Kpi label={`Charged in ${session.name}`} value={rupeesShort(totals.gross)} sub={`${lines.length} fee lines · before concession`} />
        <Kpi label="Concession" value={rupeesShort(totals.concession)} sub={totals.gross > 0 ? `${Math.round((100 * totals.concession) / totals.gross)}% of charged` : "—"} />
        <Kpi label="Expected (year)" value={rupeesShort(totals.net)} sub="After concession" />
        <Kpi label="Paid" value={rupeesShort(totals.paid)} tone={totals.net > 0 && totals.paid >= totals.net ? "good" : "default"} sub="Allocated to these lines" />
        <Kpi
          label="Remaining"
          value={rupeesShort(totals.remaining)}
          tone={totals.overdue > 0 ? "critical" : "default"}
          sub={totals.overdue > 0 ? `${rupees(totals.overdue)} already overdue` : "Nothing overdue"}
        />
      </KpiGrid>

      {(advance !== 0 || otherSessions.some((o) => o.remaining > 0)) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          {advance !== 0 && (
            <span>
              Advance held (not matched to any fee line): <b className="tabular text-ink">{rupees(advance)}</b>
            </span>
          )}
          {otherSessions
            .filter((o) => o.remaining > 0)
            .map((o) => (
              <span key={o.session.id}>
                Remaining in{" "}
                <Link href={o.session.id === active.id ? base : withParams(base, { session: o.session.id })} className="font-medium text-accent hover:underline">
                  {o.session.name}
                </Link>
                : <b className="tabular text-ink">{rupees(o.remaining)}</b>
              </span>
            ))}
        </div>
      )}

      <Card
        className="mt-4"
        title={`Fee lines · ${session.name}`}
        description="Edit an amount or concession inline. Payments are re-matched to dues automatically after every change."
      >
        {installments.length === 0 ? (
          <Empty title={`No installments in ${session.name}`}>Add installments to the session in Setup → Sessions & installments.</Empty>
        ) : (
          <FeePlan
            studentId={student.id}
            groups={groups}
            totals={{ amount: totals.gross, concession: totals.concession, net: totals.net, paid: totals.paid, remaining: totals.remaining }}
            installments={installments.map((i) => ({ id: i.id, number: i.number, name: i.name }))}
            feeHeads={heads.filter((h) => h.is_active).map((h) => ({ id: h.id, name: h.name }))}
          />
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <ConcessionTool
          studentId={student.id}
          sessionId={session.id}
          sessionName={session.name}
          installments={installments.map((i) => ({ number: i.number, name: i.name }))}
          feeHeads={heads.filter((h) => lines.some((l) => l.fee_head_id === h.id) || h.is_active).map((h) => ({ id: h.id, name: h.name }))}
        />
        <RegenerateTool
          studentId={student.id}
          sessionId={session.id}
          sessionName={session.name}
          className={enrolHere?.classes?.name ?? null}
          isActive={student.status === "active"}
        />
        <OpeningDueTool
          studentId={student.id}
          sessions={orderedSessions.map((s) => ({ id: s.id, name: s.name }))}
          defaultSessionId={defaultOpeningSession}
          currentSessionId={session.id}
          baseHref={base}
          activeSessionId={active.id}
        />
      </div>
    </>
  );
}
