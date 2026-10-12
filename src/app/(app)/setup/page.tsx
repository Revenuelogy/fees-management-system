import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getActiveSession, getClasses, getSessions } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDateShort } from "@/lib/format";
import type { Installment, ReconciliationCheck } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/bars";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { embeddedCount } from "./_lib/fetch-all";
import { listJoin, plural } from "./_lib/text";

export const metadata = { title: "Setup checklist" };

type Step = {
  key: string;
  title: string;
  done: boolean;
  /** Not done because an earlier step is missing (shown muted rather than as a problem) */
  blocked?: boolean;
  detail: React.ReactNode;
  links: { href: string; label: string }[];
};

export default async function SetupChecklistPage() {
  await requireWriter();
  const [sessions, active, classes] = await Promise.all([getSessions(), getActiveSession(), getClasses()]);
  const supabase = await createClient();
  const current = sessions.find((s) => s.is_current) ?? null;
  const activeClasses = classes.filter((c) => c.is_active);

  const headsRes = await supabase.from("fee_heads").select("id", { count: "exact", head: true }).eq("is_active", true);
  const activeHeads = headsRes.count ?? 0;

  let installments: Installment[] = [];
  let classesWithStructure = new Set<string>();
  let enrolled = 0;
  let withoutPlan: number | null = null;

  if (active) {
    const { data: inst } = await supabase.from("installments").select("*").eq("session_id", active.id).order("number");
    installments = (inst as Installment[]) ?? [];
    const instIds = installments.map((i) => i.id);
    const [structRes, enrolRes, reconRes] = await Promise.all([
      instIds.length
        ? supabase
            .from("classes")
            .select("id, fee_structures(count)")
            .in("fee_structures.installment_id", instIds)
            .gt("fee_structures.amount", 0)
        : Promise.resolve({ data: [] as { id: string; fee_structures: unknown }[] }),
      supabase
        .from("enrollments")
        .select("student_id, students!inner(status)", { count: "exact", head: true })
        .eq("session_id", active.id)
        .eq("students.status", "active"),
      supabase.rpc("reconciliation", { p_session: active.id }),
    ]);
    classesWithStructure = new Set(
      ((structRes.data ?? []) as { id: string; fee_structures: unknown }[])
        .filter((c) => embeddedCount(c.fee_structures) > 0)
        .map((c) => c.id),
    );
    enrolled = enrolRes.count ?? 0;
    const checks = ((reconRes.data as { checks?: ReconciliationCheck[] } | null)?.checks ?? []) as ReconciliationCheck[];
    const check = checks.find((c) => c.key === "enrolled_without_plan");
    withoutPlan = check ? Number(check.left ?? 0) : null;
  }

  const missingStructure = activeClasses.filter((c) => !classesWithStructure.has(c.id));
  const sessionName = active?.name ?? "the session";

  const steps: Step[] = [
    {
      key: "sessions",
      title: "Academic session",
      done: sessions.length > 0 && !!current,
      detail:
        sessions.length === 0 ? (
          "No sessions yet. Create one (for example 2026-27, April to March) with its installments."
        ) : current ? (
          <>
            {plural(sessions.length, "session")} · current session is <b className="text-ink">{current.name}</b>
          </>
        ) : (
          <>{plural(sessions.length, "session")}, but none is marked current. Mark the running session as current.</>
        ),
      links: [{ href: "/setup/sessions", label: "Sessions" }],
    },
    {
      key: "installments",
      title: `Installments for ${sessionName}`,
      done: installments.length > 0,
      blocked: !active,
      detail: !active
        ? "Create a session first."
        : installments.length === 0
          ? `${active.name} has no installments. Add the due dates the school collects fees on.`
          : `${plural(installments.length, "installment")} · due ${listJoin(installments.map((i) => fmtDateShort(i.due_date)))}`,
      links: [{ href: "/setup/sessions", label: "Installments" }],
    },
    {
      key: "classes",
      title: "Classes",
      done: activeClasses.length > 0,
      detail:
        activeClasses.length === 0
          ? "No classes yet. Add classes in the order they are taught (Nursery, LKG, … Class 12)."
          : `${plural(activeClasses.length, "active class", "active classes")}${
              classes.length > activeClasses.length ? ` (${classes.length - activeClasses.length} inactive)` : ""
            }`,
      links: [{ href: "/setup/classes", label: "Classes" }],
    },
    {
      key: "heads",
      title: "Fee heads",
      done: activeHeads > 0,
      detail:
        activeHeads === 0
          ? "No fee heads yet. Add the kinds of fees you charge (Tuition, Annual charges, Exam, Transport, …)."
          : `${plural(activeHeads, "active fee head")}`,
      links: [{ href: "/setup/classes#fee-heads", label: "Fee heads" }],
    },
    {
      key: "structure",
      title: `Fee structure for ${sessionName}`,
      done: !!active && activeClasses.length > 0 && installments.length > 0 && missingStructure.length === 0,
      blocked: !active || activeClasses.length === 0 || installments.length === 0,
      detail:
        !active || activeClasses.length === 0 || installments.length === 0
          ? "Needs a session with installments and at least one class."
          : missingStructure.length === 0
            ? `All ${plural(activeClasses.length, "active class", "active classes")} have fee amounts.`
            : `${plural(missingStructure.length, "class has", "classes have")} no amounts yet: ${listJoin(missingStructure.map((c) => c.name))}.`,
      links: [
        {
          href: missingStructure.length && active ? `/setup/fee-structure?class=${missingStructure[0].id}` : "/setup/fee-structure",
          label: "Fee structure",
        },
      ],
    },
    {
      key: "students",
      title: `Students enrolled in ${sessionName}`,
      done: enrolled > 0,
      blocked: !active,
      detail: !active
        ? "Create a session first."
        : enrolled === 0
          ? `Nobody is enrolled in ${active.name} yet. Import students from a spreadsheet, or promote last session's students.`
          : `${plural(enrolled, "active student")} enrolled in ${active.name}.`,
      links: [
        { href: "/setup/import?tab=students", label: "Import students" },
        { href: "/setup/promote", label: "Promote" },
      ],
    },
    {
      key: "charges",
      title: "Charges generated",
      done: enrolled > 0 && withoutPlan === 0,
      blocked: enrolled === 0,
      detail:
        enrolled === 0
          ? "Enrol students first."
          : withoutPlan === null
            ? "Could not check charges."
            : withoutPlan === 0
              ? "Every enrolled student has a fee plan for the session."
              : `${plural(withoutPlan, "enrolled student has", "enrolled students have")} no charges yet. Open the fee structure and use “Apply to students”.`,
      links: [{ href: "/setup/fee-structure", label: "Apply fee structure" }],
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done);

  return (
    <>
      <PageHeader
        title="Setup checklist"
        crumbs={[{ label: "Setup" }]}
        description={
          active ? (
            <>
              Checking session <b className="text-ink">{active.name}</b> (chosen in the top bar)
              {current && current.id !== active.id ? <>. The current session is {current.name}.</> : "."}
            </>
          ) : (
            "Start here when setting up the school or a new academic year."
          )
        }
        actions={
          nextStep ? (
            <LinkButton href={nextStep.links[0].href} variant="primary">
              Next: {nextStep.title} <ArrowRight className="size-4" />
            </LinkButton>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title={`${doneCount} of ${steps.length} steps done`}
          description={doneCount === steps.length ? "Setup is complete. You can collect fees." : "Work top to bottom; each step builds on the one before."}
        >
          <Meter value={(100 * doneCount) / steps.length} className="mb-4" />
          <ol className="divide-y divide-line">
            {steps.map((s, i) => {
              const Icon = s.done ? CheckCircle2 : s.blocked ? Circle : AlertTriangle;
              return (
                <li key={s.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Icon
                      className={
                        s.done ? "mt-0.5 size-5 shrink-0 text-good" : s.blocked ? "mt-0.5 size-5 shrink-0 text-muted" : "mt-0.5 size-5 shrink-0 text-warning"
                      }
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">
                          {i + 1}. {s.title}
                        </span>
                        {s.done ? <Badge tone="good">Done</Badge> : s.blocked ? <Badge>Waiting</Badge> : <Badge tone="warning">To do</Badge>}
                      </div>
                      <p className="mt-0.5 text-[13px] text-ink-2">{s.detail}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 pl-8 sm:pl-0">
                    {s.links.map((l) => (
                      <LinkButton key={l.href} href={l.href} size="sm" variant={!s.done && !s.blocked && l === s.links[0] ? "primary" : "secondary"}>
                        {l.label}
                      </LinkButton>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card title="How setup works" description="The order matters: each step uses what the one before created.">
          <ol className="space-y-3 text-[13px] text-ink-2">
            <HelpStep n={1} href="/setup/sessions" title="Sessions & installments">
              An academic year (e.g. 2026-27) and the dates fees fall due in it.
            </HelpStep>
            <HelpStep n={2} href="/setup/classes" title="Classes & fee heads">
              The classes you teach and the kinds of fees you charge. Fee head priority decides what a payment clears first.
            </HelpStep>
            <HelpStep n={3} href="/setup/fee-structure" title="Fee structure">
              How much each class pays per installment for each fee head.
            </HelpStep>
            <HelpStep n={4} href="/setup/import" title="Students">
              Import from a spreadsheet, or promote last year&apos;s students into the new session.
            </HelpStep>
            <HelpStep n={5} href="/setup/fee-structure" title="Generate charges">
              “Apply to students” turns the fee structure into each student&apos;s charges. Concessions and transport are then set on each
              student&apos;s fee page.
            </HelpStep>
            <HelpStep n={6} href="/collect" title="Collect fees">
              Record payments at the counter; receipts and every report update straight away.
            </HelpStep>
          </ol>
          <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
            Moving from another system? Import{" "}
            <Link href="/setup/import?tab=dues" className="font-medium text-accent hover:underline">
              opening dues
            </Link>{" "}
            and{" "}
            <Link href="/setup/import?tab=payments" className="font-medium text-accent hover:underline">
              past payments
            </Link>{" "}
            after the students.
          </p>
        </Card>
      </div>
    </>
  );
}

function HelpStep({ n, href, title, children }: { n: number; href: string; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-strong">{n}</span>
      <div>
        <Link href={href} className="font-medium text-ink hover:text-accent hover:underline">
          {title}
        </Link>
        <p className="mt-0.5">{children}</p>
      </div>
    </li>
  );
}
