import { notFound } from "next/navigation";
import { Coins, ExternalLink } from "lucide-react";
import { requireWriter } from "@/lib/auth";
import { getActiveSession, getClasses, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, todayIST } from "@/lib/format";
import type { Student } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { LinkButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FormError } from "@/components/ui/form";
import { StudentForm, type EnrollmentValue } from "../../student-form";
import { STUDENT_STATUS_LABELS, isUuid } from "../../helpers";
import { StatusPanel } from "./status-panel";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params, searchParams }: PageProps<"/students/[id]/edit">) {
  await requireWriter();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();

  const [session, classes] = await Promise.all([getActiveSession(), getClasses()]);
  const supabase = await createClient();
  const [studentRes, enrolRes, paymentsRes, waivedRes] = await Promise.all([
    supabase.from("students").select("*").eq("id", id).maybeSingle(),
    session
      ? supabase.from("enrollments").select("class_id, section, roll_no").eq("student_id", id).eq("session_id", session.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("student_id", id),
    supabase.from("student_charges").select("id", { count: "exact", head: true }).eq("student_id", id).not("concession_before_waiver", "is", null),
  ]);
  if (studentRes.error) throw new Error(studentRes.error.message);
  const student = studentRes.data as Student | null;
  if (!student) notFound();
  const enrollment = (enrolRes.data as EnrollmentValue) ?? null;
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
          paymentCount={paymentsRes.count ?? 0}
          waivedLines={waivedRes.count ?? 0}
          today={todayIST()}
        />
      </div>
    </>
  );
}
