"use client";

import { Coins, ExternalLink } from "lucide-react";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { fmtDate, todayIST } from "@/lib/format";
import type { StudentRecord } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form";
import { StudentForm } from "../../student-form";
import { STUDENT_STATUS_LABELS } from "../../helpers";
import { StatusPanel } from "./status-panel";

export function EditStudent({ id, sp }: { id: string; sp: SearchParams }) {
  const { session, classes } = useApp();
  const res = useApi<StudentRecord>(apiUrl(`/api/students/${id}`, { session: session?.id }), { refreshInterval: 0 });
  if (!res.data) return <Pending queries={[res]} />;
  const { student, enrollment } = res.data;
  const className = enrollment ? classes.find((c) => c.id === enrollment.class_id)?.name : null;

  return (
    <>
      <PageHeader
        title={`Edit ${student.full_name}`}
        crumbs={[
          { label: "Students", href: "/students" },
          { label: student.full_name, href: `/students/${student.id}` },
          { label: "Edit" },
        ]}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Adm. no {student.admission_no}</span>
            {className && session && (
              <span>
                · {className} – {enrollment?.section} in {session.name}
              </span>
            )}
            <Badge tone={student.status === "active" ? "good" : "neutral"}>
              {STUDENT_STATUS_LABELS[student.status]}
              {student.status === "left" && student.left_on ? ` · ${fmtDate(student.left_on)}` : ""}
            </Badge>
          </span>
        }
        actions={
          <>
            <LinkButton href={`/students/${student.id}/fees`}>
              <Coins className="size-4" /> Fee plan
            </LinkButton>
            <LinkButton href={`/students/${student.id}`}>
              <ExternalLink className="size-4" /> Student 360
            </LinkButton>
          </>
        }
      />

      {param(sp.warn) === "enrol" && (
        <div className="mb-4">
          <FormError message="The student was saved, but enrolling them in the class failed. Check the class below and save again." />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <StudentForm
          student={student}
          enrollment={enrollment}
          classes={classes}
          session={session ? { id: session.id, name: session.name } : null}
          today={todayIST()}
        />
        <StatusPanel
          studentId={student.id}
          admissionNo={student.admission_no}
          status={student.status}
          leftOn={student.left_on}
          paymentCount={res.data.payments}
          waivedLines={res.data.waived_lines}
          today={todayIST()}
        />
      </div>
    </>
  );
}
