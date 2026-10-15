import { notFound } from "next/navigation";
import { requireWriter } from "@/lib/auth";
import { getSessions, getSettings } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/format";
import type { DueLine, Student360 } from "@/lib/types";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { FeeStatusBadge } from "@/components/ui/status";
import { LinkButton } from "@/components/ui/button";
import { CollectForm } from "./collect-form";

export const metadata = { title: "Collect fee" };

export default async function CollectStudentPage({ params }: PageProps<"/collect/[studentId]">) {
  await requireWriter();
  const { studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const supabase = await createClient();
  const [s360, duesRes, sessions, settings] = await Promise.all([
    supabase.rpc("student_360", { p_student: studentId }),
    supabase.rpc("student_dues", { p_student: studentId }),
    getSessions(),
    getSettings(),
  ]);
  if (s360.error?.message?.includes("not found")) notFound();
  if (s360.error || !s360.data) throw new Error(s360.error?.message ?? "Could not load student");
  const d = s360.data as Student360;
  const dues = ((duesRes.data ?? []) as DueLine[]).filter((l) => l.remaining > 0);
  const st = d.student;
  const enr = d.enrollments.find((e) => e.is_current) ?? d.enrollments[0];
  const today = todayIST();

  return (
    <>
      <Breadcrumbs items={[{ label: "Collect fee", href: "/collect" }]} />
      <section className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={st.full_name} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-title1 font-bold text-ink">
            {st.full_name} <FeeStatusBadge status={d.fee_status} />
          </h1>
          <p className="text-subhead text-ink-2">
            {[enr ? `${enr.class_name} · ${enr.section}${enr.roll_no ? ` · Roll ${enr.roll_no}` : ""}` : null, st.admission_no, st.father_name, st.phone].filter(Boolean).join("  ·  ")}
          </p>
        </div>
        <LinkButton href={`/students/${studentId}`}>View profile</LinkButton>
      </section>
      <CollectForm
        studentId={studentId}
        dues={dues}
        today={today}
        advance={d.balance?.advance_balance ?? 0}
        order={settings?.allocation_order ?? "oldest_first"}
        sessions={sessions.map((s) => ({ id: s.id, start: s.start_date, end: s.end_date, name: s.name }))}
        recent={d.payments.filter((p) => !p.is_reversal).slice(0, 3).map((p) => ({ id: p.payment_id, receipt_no: p.receipt_no, paid_on: p.paid_on, amount: p.amount, cancelled: p.cancelled }))}
      />
    </>
  );
}
