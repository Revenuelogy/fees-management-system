"use client";

import { todayIST } from "@/lib/format";
import { useApp } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StudentForm } from "../student-form";

export function NewStudent() {
  const { session, classes } = useApp();

  return (
    <>
      <PageHeader
        title="Add student"
        crumbs={[{ label: "Students", href: "/students" }, { label: "Add student" }]}
        description="Fields marked * are required."
        info="Choosing a class enrols the student in the session and creates their fee plan."
      />
      <StudentForm classes={classes} session={session ? { id: session.id, name: session.name } : null} today={todayIST()} />
    </>
  );
}
