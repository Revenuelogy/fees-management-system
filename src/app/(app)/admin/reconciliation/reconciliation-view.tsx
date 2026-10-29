"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, Lock, XCircle } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { monthLabel, monthsBetween, num, rupees, todayIST } from "@/lib/format";
import type { AuditRow, MonthSnapshot, Reconciliation, ReconciliationCheck } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTip } from "@/components/ui/info-tip";
import { DataTable } from "@/components/ui/data-table";
import { NoSession } from "@/components/no-session";
import { cn } from "@/lib/cn";
import { MonthCloseForm, RerunAllocationForm } from "./recon-forms";

type Kind = "pass" | "fail" | "warning" | "info";

const KIND: Record<Kind, { label: string; tone: "good" | "critical" | "warning" | "neutral"; icon: React.ElementType }> = {
  pass: { label: "Pass", tone: "good", icon: CheckCircle2 },
  fail: { label: "Fail", tone: "critical", icon: XCircle },
  warning: { label: "Warning", tone: "warning", icon: AlertTriangle },
  info: { label: "Info", tone: "neutral", icon: Info },
};

// the check titles in the glossary's words (the SQL labels are the fallback for a check added later)
const LABELS: Record<string, string> = {
  class_vs_school_pending: "Sum of what remains per class = what remains for the school (incl. previous years)",
  months_vs_session_received: "Sum of monthly received = session received",
  installments_plus_advance: "Installments received + received for previous years + paid in advance = total received",
  payments_fully_allocated: "Payments not fully split into what they paid for",
  charges_over_allocated: "Fee lines with more money than their amount",
  enrolled_without_plan: "Enrolled active students with no fees assigned for the session",
  charges_without_enrolment: "Students with fees assigned in the session but no enrolment",
  inferred_allocations: "Payments split by the default rule (imported receipts without a fee type)",
};

const HINTS: Record<string, string> = {
  class_vs_school_pending: "Every student's remaining fees roll up into exactly one class row. A difference means money or fees that are not being counted.",
  months_vs_session_received: "Receipts dated in the session, added up month by month, must equal the session total.",
  installments_plus_advance: "Every rupee received in the session is split into this year's fees, previous years' dues or paid in advance.",
  payments_fully_allocated: "Each receipt must be fully split into what it paid for. If not, re-run allocation below.",
  charges_over_allocated: "No fee line may receive more than its net amount. If any do, re-run allocation below.",
  enrolled_without_plan: "These students are in a class but have no fee lines. Assign fees from the fee structure or open their fee plan.",
  charges_without_enrolment: "These students have fee lines in the session but no class. Enrol them (edit student) or remove the lines.",
  inferred_allocations: "Imported receipts that carried no fee type were split with the default rule.",
};


function kindOf(c: ReconciliationCheck): Kind {
  if (c.info) return "info";
  if (c.ok) return "pass";
  return c.warning ? "warning" : "fail";
}

function value(c: ReconciliationCheck, v: number | null) {
  if (v === null || v === undefined) return "—";
  return c.count ? num(v) : rupees(v);
}

function lastDayOf(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const short = (s: string) => s.replace(UUID_RE, (u) => `${u.slice(0, 8)}…`);

function summarize(details: unknown): string {
  if (details === null || details === undefined) return "";
  if (typeof details !== "object") return short(String(details));
  const parts = Object.entries(details as Record<string, unknown>).map(([k, v]) => {
    let val: string;
    if (v === null || v === undefined) val = "—";
    else if (typeof v === "number" && /^(amount|amount_from|paid)$/.test(k)) val = rupees(v);
    else if (typeof v === "object") val = JSON.stringify(v);
    else val = String(v);
    return `${k.replace(/_/g, " ")}: ${short(val)}`;
  });
  const out = parts.join(" · ");
  return out.length > 220 ? `${out.slice(0, 219)}…` : out;
}

export function ReconciliationView() {
  const { session, settings, admin } = useApp();
  const tz = settings.timezone ?? "Asia/Kolkata";
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  const months = session ? monthsBetween(session.start_date, session.end_date) : [];
  const reconRes = useApi<Reconciliation>(session ? apiUrl("/api/analytics/reconciliation", { session: session.id }) : null);
  const snapRes = useApi<MonthSnapshot[]>(session ? apiUrl("/api/admin/snapshots", { from: months[0], to: months[months.length - 1] }) : null);
  const auditRes = useApi<AuditRow[]>(session && admin ? "/api/admin/audit?limit=50" : null);
  if (!session) return <NoSession />;
  if (!reconRes.data || !snapRes.data || (admin && !auditRes.data)) return <Pending queries={admin ? [reconRes, snapRes, auditRes] : [reconRes, snapRes]} />;
  const recon = reconRes.data;
  const snapshots = new Map(snapRes.data.map((s) => [s.month, s]));
  const audit = auditRes.data ?? [];

  const checks = recon.checks ?? [];
  const fails = checks.filter((c) => kindOf(c) === "fail").length;
  const warns = checks.filter((c) => kindOf(c) === "warning").length;
  const problems = fails + warns;
  const today = todayIST();

  return (
    <>
      <PageHeader
        title="Health checks"
        description={`Session ${recon.session.name} · checked ${when(recon.checked_at)}`}
        info="The same money counted different ways must agree to the paisa."
      />

      <Card>
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "inline-flex size-14 shrink-0 items-center justify-center rounded-full",
              problems === 0 ? "bg-good-soft text-good-ink" : fails > 0 ? "bg-critical-soft text-critical-ink" : "bg-warning-soft text-ink",
            )}
          >
            {problems === 0 ? <CheckCircle2 className="size-7" aria-hidden /> : fails > 0 ? <XCircle className="size-7" aria-hidden /> : <AlertTriangle className="size-7" aria-hidden />}
          </span>
          <div>
            <p className="text-title3 font-semibold text-ink">
              {problems === 0 ? "All checks pass" : `${problems} ${problems === 1 ? "problem" : "problems"} found`}
            </p>
            <p className="text-subhead text-ink-2">
              {problems === 0
                ? `${checks.filter((c) => !c.info).length} checks agree to the paisa.`
                : [fails ? `${fails} failed` : null, warns ? `${warns} ${warns === 1 ? "warning" : "warnings"}` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {checks.map((c) => {
            const k = kindOf(c);
            const K = KIND[k];
            const Icon = K.icon;
            const diff = !c.ok && !c.count && c.left !== null && c.right !== null ? c.left - c.right : null;
            const problem = k === "fail" || k === "warning";
            return (
              <li key={c.key} className="flex items-center gap-3 py-3">
                <Icon
                  className={cn("size-5 shrink-0", k === "pass" ? "text-good" : k === "fail" ? "text-critical" : k === "warning" ? "text-warning" : "text-muted")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-subhead font-medium text-ink">
                    {LABELS[c.key] ?? c.label}
                    {HINTS[c.key] && <InfoTip>{HINTS[c.key]}</InfoTip>}
                    {problem ? <Badge tone={K.tone}>{K.label}</Badge> : <span className="sr-only">{K.label}</span>}
                  </span>
                  {problem && (
                    <span className="block text-caption text-muted">
                      Should be {value(c, c.right)}
                      {diff !== null && diff !== 0 && <> · off by {rupees(diff, { sign: true })}</>}
                    </span>
                  )}
                </span>
                <span className={cn("shrink-0 text-right text-subhead tabular", problem ? "font-semibold text-critical-ink" : "text-ink-2")}>
                  {c.info ? (c.rows !== undefined ? `${num(c.rows)} allocations` : "—") : value(c, c.left)}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card
          title="Payment allocation"
          description="Allocations (what each payment paid for) are rebuilt automatically whenever charges, payments or the rule change. Re-running rebuilds them for every student from scratch; receipts never change."
        >
          {admin ? (
            <RerunAllocationForm />
          ) : (
            <p className="text-footnote text-ink-2">Only the owner / admin can re-run allocation.</p>
          )}
          <p className="mt-3 text-footnote text-muted">
            Current rule:{" "}
            <b className="text-ink-2">
              {settings?.allocation_order === "current_first" ? "this year first, then previous years" : "oldest fees first"}
            </b>
            {admin && (
              <>
                {" · "}
                <Link href="/settings" className="font-medium text-accent hover:underline">
                  change
                </Link>
              </>
            )}
          </p>
        </Card>

        <Card
          title={`Month close · ${session.name}`}
          description="Closing a month freezes its numbers (month report, class split, payment modes) and blocks new payments dated inside it. Later corrections — a cancelled receipt or a changed fee plan — then show up as adjustments in the month they are made. Reopen a month to make it live again."
        >
          <div className="relative overflow-x-auto rounded-2xl border border-line">
            <table className="w-full border-collapse text-left text-subhead">
              <tbody>
                {months.map((m) => {
                  const snap = snapshots.get(m);
                  const ended = lastDayOf(m) < today;
                  return (
                    <tr key={m} className="border-t border-line first:border-t-0">
                      <td className="whitespace-nowrap px-4 py-2">
                        <Link href={`/monthly?month=${m}`} className="font-medium text-ink hover:text-accent hover:underline">
                          {monthLabel(m)}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        {snap ? (
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Badge tone="accent">
                              <Lock className="size-3.5" aria-hidden /> Closed
                            </Badge>
                            <span className="text-footnote text-muted">
                              {when(snap.closed_at)}
                              {snap.closed_by_name ? ` · ${snap.closed_by_name}` : ""}
                            </span>
                          </span>
                        ) : ended ? (
                          <Badge tone="neutral">Open</Badge>
                        ) : (
                          <span className="whitespace-nowrap text-footnote text-muted">{m === today.slice(0, 7) ? "In progress" : "Not ended yet"}</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        {admin && (snap || ended) && <MonthCloseForm month={m} closed={!!snap} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {admin && (
        <Card className="mt-4" title="Audit log" description="The latest 50 recorded actions (receipts, cancellations, imports, concessions, month closes, role changes…).">
          <DataTable
            rows={audit.map((a) => ({
              id: String(a.id),
              at: when(a.at),
              who: a.user_id ? a.user_name ?? short(a.user_id) : "System",
              action: a.action.replace(/_/g, " "),
              entity: a.entity ? `${a.entity}${a.entity_id ? ` · ${short(a.entity_id)}` : ""}` : null,
              details: summarize(a.details),
            }))}
            columns={[
              { key: "at", label: "Time", sortable: false, className: "whitespace-nowrap" },
              { key: "who", label: "By", hideOnMobile: true },
              { key: "action", label: "Action" },
              { key: "entity", label: "Entity", hideOnMobile: true },
              { key: "details", label: "Details", sortable: false, className: "text-footnote text-ink-2" },
            ]}
            searchKeys={["action", "entity", "details", "who"]}
            searchPlaceholder="Search the log…"
            exportName="audit-log"
            dense
            empty="Nothing recorded yet."
          />
        </Card>
      )}
    </>
  );
}
