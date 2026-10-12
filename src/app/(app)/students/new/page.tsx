import { requireWriter } from "@/lib/auth";
import { getActiveSession, getClasses } from "@/lib/context";
import { todayIST } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { StudentForm } from "../student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  await requireWriter();
  const [session, classes] = await Promise.all([getActiveSession(), getClasses()]);

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
