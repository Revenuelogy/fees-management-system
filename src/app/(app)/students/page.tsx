import Link from "next/link";
import { UserPlus } from "lucide-react";
import { canWrite, requireStaff } from "@/lib/auth";
import { getActiveSession, getClasses, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, num } from "@/lib/format";
import type { Student } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty } from "@/components/ui/empty";
import { STUDENT_STATUS_LABELS, compareRoll, isUuid } from "./helpers";

export const metadata = { title: "Students" };

type EnrollmentEmbed = {
  session_id: string;
  section: string;
  roll_no: string | null;
  class_id: string;
  classes: { name: string; sort_order: number } | null;
};

type StudentRow = Pick<Student, "id" | "admission_no" | "full_name" | "father_name" | "phone" | "status" | "left_on"> & {
  enrollments: EnrollmentEmbed[];
};

const PAGE = 1000; // PostgREST max_rows

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const [session, classes] = await Promise.all([getActiveSession(), getClasses()]);
  const supabase = await createClient();

  // Every student (any status), with their enrolment in the active session only.
  const students: StudentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("students")
      .select("id, admission_no, full_name, father_name, phone, status, left_on, enrollments(session_id, section, roll_no, class_id, classes(name, sort_order))")
      .order("admission_no")
      .range(from, from + PAGE - 1);
    if (session) q = q.eq("enrollments.session_id", session.id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as StudentRow[];
    students.push(...batch);
    if (batch.length < PAGE) break;
  }

  const classParam = param(sp.class);
  const classFilter = isUuid(classParam) ? classes.find((c) => c.id === classParam) ?? null : null;

  const rows = students
    .map((s) => {
      const e = session ? s.enrollments.find((x) => x.session_id === session.id) ?? null : null;
      return {
        id: s.id,
        admission_no: s.admission_no,
        full_name: s.full_name,
        father_name: s.father_name,
        phone: s.phone,
        class_id: e?.class_id ?? "none",
        class_name: e?.classes?.name ?? null,
        class_order: e?.classes?.sort_order ?? Number.MAX_SAFE_INTEGER,
        section: e?.section ?? null,
        class_label: e ? `${e.classes?.name ?? "?"} – ${e.section}` : null,
        roll_no: e?.roll_no ?? null,
        status: s.status,
        status_label:
          s.status === "left" && s.left_on ? `Left · ${fmtDate(s.left_on)}` : STUDENT_STATUS_LABELS[s.status],
        manage: "Edit",
      };
    })
    .filter((r) => !classFilter || r.class_id === classFilter.id)
    .sort(
      (a, b) =>
        a.class_order - b.class_order ||
        (a.class_name ?? "").localeCompare(b.class_name ?? "") ||
        (a.section ?? "").localeCompare(b.section ?? "") ||
        compareRoll(a.roll_no, b.roll_no) ||
        a.full_name.localeCompare(b.full_name),
    );

  const counts = {
    active: students.filter((s) => s.status === "active").length,
    left: students.filter((s) => s.status === "left").length,
    passed: students.filter((s) => s.status === "passed_out").length,
    enrolled: session ? students.filter((s) => s.enrollments.some((e) => e.session_id === session.id)).length : 0,
  };
  const activeNotEnrolled = session
    ? students.filter((s) => s.status === "active" && !s.enrollments.some((e) => e.session_id === session.id)).length
    : 0;

  const writer = canWrite(viewer.role);
  const columns: Column[] = [
    { key: "admission_no", label: "Adm. no" },
    { key: "full_name", label: "Name", href: "/students/{id}" },
    { key: "father_name", label: "Father", hideOnMobile: true },
    { key: "phone", label: "Phone", hideOnMobile: true },
    { key: "class_label", label: "Class" },
    { key: "roll_no", label: "Roll", hideOnMobile: true },
    { key: "status_label", label: "Status" },
  ];
  if (writer) columns.push({ key: "manage", label: "", href: "/students/{id}/edit", sortable: false, hideOnMobile: true });

  return (
    <>
      <PageHeader
        title="Students"
        crumbs={classFilter ? [{ label: "Students", href: "/students" }, { label: classFilter.name }] : []}
        description={
          session ? (
            <>
              Student register with each student&apos;s class in <b>{session.name}</b>. {num(counts.active)} active ·{" "}
              {num(counts.enrolled)} enrolled in {session.name} · {num(counts.left)} left · {num(counts.passed)} passed out.
            </>
          ) : (
            "Student register. Create an academic session to enrol students into classes."
          )
        }
        actions={
          writer && (
            <LinkButton href="/students/new" variant="primary">
              <UserPlus className="size-4" /> Add student
            </LinkButton>
          )
        }
      >
        {classFilter && (
          <p className="text-[13px] text-ink-2">
            Showing <b>{classFilter.name}</b> only ·{" "}
            <Link href="/students" className="font-medium text-accent hover:underline">
              Show all classes
            </Link>
          </p>
        )}
      </PageHeader>

      {activeNotEnrolled > 0 && session && !classFilter && (
        <p className="mb-4 rounded-lg border border-line bg-warning-soft px-3 py-2 text-[13px] text-ink">
          {activeNotEnrolled} active {activeNotEnrolled === 1 ? "student is" : "students are"} not enrolled in {session.name}. They have
          no class or fee plan for this session — choose <b>Class: Not enrolled</b> below to find them.
        </p>
      )}

      <Card>
        {students.length === 0 ? (
          <Empty title="No students yet">
            Add students one by one, or import them from a spreadsheet.
            {writer && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <LinkButton href="/students/new" variant="primary">
                  <UserPlus className="size-4" /> Add student
                </LinkButton>
                <LinkButton href="/setup/import">Import data</LinkButton>
              </div>
            )}
          </Empty>
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            searchKeys={["full_name", "admission_no", "father_name", "phone"]}
            searchPlaceholder="Search name, admission no, father, phone…"
            filters={[
              ...(classFilter
                ? []
                : [
                    {
                      key: "class_id",
                      label: "Class",
                      options: [
                        ...classes.map((c) => ({ value: c.id, label: c.name })),
                        ...(session ? [{ value: "none", label: `Not enrolled in ${session.name}` }] : []),
                      ],
                    },
                  ]),
              {
                key: "status",
                label: "Status",
                options: (Object.keys(STUDENT_STATUS_LABELS) as Student["status"][]).map((s) => ({ value: s, label: STUDENT_STATUS_LABELS[s] })),
              },
            ]}
            pageSize={100}
            exportName={`students${session ? `-${session.name}` : ""}${classFilter ? `-${classFilter.name}` : ""}`}
            exportMeta={[session ? `Classes as enrolled in session ${session.name}` : "No session", ...(classFilter ? [`Class ${classFilter.name}`] : [])]}
            empty="No students match."
          />
        )}
      </Card>
    </>
  );
}
