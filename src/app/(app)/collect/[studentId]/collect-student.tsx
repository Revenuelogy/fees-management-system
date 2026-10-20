"use client";

import { useApi } from "@/lib/api/hooks";
import { todayIST } from "@/lib/format";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import type { DueLine, Student360, StudentRecovery } from "@/lib/types";
import { Breadcrumbs } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { FeeStatusBadge } from "@/components/ui/status";
import { LinkButton } from "@/components/ui/button";
import { CollectForm } from "./collect-form";

export function CollectStudent({ studentId }: { studentId: string }) {
  const { sessions, settings } = useApp();
  // no background refresh while the cashier is filling the form
  const s360 = useApi<Student360>(`/api/students/${studentId}/360`, { refreshInterval: 0, revalidateOnFocus: false });
  const duesRes = useApi<DueLine[]>(`/api/students/${studentId}/dues`, { refreshInterval: 0, revalidateOnFocus: false });
  // optional: running recovery activities of the student (the form works without it)
  const rec = useApi<StudentRecovery>(`/api/students/${studentId}/recovery`, { refreshInterval: 0, revalidateOnFocus: false });
  if (!s360.data || !duesRes.data) return <Pending queries={[s360, duesRes]} />;
  const d = s360.data;
  const dues = duesRes.data.filter((l) => l.remaining > 0);
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
        activities={(rec.data?.activities ?? []).filter((a) => a.status === "active").map((a) => ({ participant_id: a.participant_id, name: a.name }))}
      />
    </>
  );
}
