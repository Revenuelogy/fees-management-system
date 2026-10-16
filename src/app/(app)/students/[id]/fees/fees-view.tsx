"use client";

import Link from "next/link";
import { ExternalLink, IndianRupee, Pencil } from "lucide-react";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { fmtDate, rupees, rupeesShort } from "@/lib/format";
import type { DueLine, FeePlanData } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty";
import { NoSession } from "@/components/no-session";
import { STUDENT_STATUS_LABELS } from "../../helpers";
import { FeePlan, type PlanGroup } from "./fee-plan";
import { ConcessionTool, OpeningDueTool, RegenerateTool } from "./fee-tools";

export function FeesView({ id, sp }: { id: string; sp: SearchParams }) {
  const { sessions, session: active } = useApp();
  const requested = param(sp.session);
  const session = sessions.find((s) => s.id === requested) ?? active;
  const res = useApi<FeePlanData>(session ? apiUrl(`/api/students/${id}/fees`, { session: session.id }) : null, { refreshInterval: 0 });
  if (!active || !session) return <NoSession />;
  if (!res.data) return <Pending queries={[res]} />;

  const { student, enrollments, dues, installments, heads, advance } = res.data;
  const meta = new Map(res.data.meta.map((m) => [m.id, m]));

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
                ? `${enrolActive.class_name} – ${enrolActive.section}${enrolActive.roll_no ? `, roll ${enrolActive.roll_no}` : ""} in ${active.name}`
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
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-footnote text-ink-2">
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
          className={enrolHere?.class_name ?? null}
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
