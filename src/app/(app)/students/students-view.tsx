"use client";

import Link from "next/link";
import { UserPlus } from "lucide-react";
import { param, type SearchParams } from "@/lib/context";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { fmtDate, num } from "@/lib/format";
import type { Student, StudentListRow } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty } from "@/components/ui/empty";
import { STUDENT_STATUS_LABELS, compareRoll, isUuid } from "./helpers";

export function StudentsView({ sp }: { sp: SearchParams }) {
  const { session, classes, writer } = useApp();
  // Every student (any status), with their enrolment in the active session only.
  const res = useApi<StudentListRow[]>(apiUrl("/api/students", { session: session?.id }));
  if (!res.data) return <Pending queries={[res]} />;
  const students = res.data;

  const classParam = param(sp.class);
  const classFilter = isUuid(classParam) ? classes.find((c) => c.id === classParam) ?? null : null;

  const rows = students
    .map((s) => {
      const enrolled = s.class_id !== null;
      return {
        id: s.id,
        admission_no: s.admission_no,
        full_name: s.full_name,
        father_name: s.father_name,
        phone: s.phone,
        class_id: s.class_id ?? "none",
        class_name: s.class_name,
        class_order: s.class_order ?? Number.MAX_SAFE_INTEGER,
        section: s.section,
        class_label: enrolled ? `${s.class_name ?? "?"} · ${s.section}` : null,
        roll_no: s.roll_no,
        status: s.status,
        status_label:
          s.status === "left" && s.left_on ? `Left · ${fmtDate(s.left_on)}` : STUDENT_STATUS_LABELS[s.status],
        manage: "Edit",
        who: [s.admission_no, s.father_name].filter(Boolean).join(" · "),
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
    enrolled: session ? students.filter((s) => s.class_id !== null).length : 0,
  };
  const activeNotEnrolled = session ? students.filter((s) => s.status === "active" && s.class_id === null).length : 0;

  const columns: Column[] = [
    { key: "full_name", label: "Student", type: "person", href: "/students/{id}", sub: "who" },
    { key: "class_label", label: "Class", className: "whitespace-nowrap" },
    { key: "roll_no", label: "Roll", hideOnMobile: true },
    { key: "phone", label: "Phone", hideOnMobile: true },
    { key: "status_label", label: "Status", hideOnMobile: true },
  ];
  if (writer) columns.push({ key: "manage", label: "", type: "action", href: "/students/{id}/edit", sortable: false, hideOnMobile: true });

  return (
    <>
      <PageHeader
        title="Students"
        crumbs={classFilter ? [{ label: "Students", href: "/students" }, { label: classFilter.name }] : []}
        description={
          session
            ? `${num(counts.active)} active · ${num(counts.enrolled)} in ${session.name} · ${num(counts.left)} left · ${num(counts.passed)} passed out`
            : "Create an academic session to enrol students into classes."
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
          <p className="text-footnote text-ink-2">
            Showing <b>{classFilter.name}</b> only ·{" "}
            <Link href="/students" className="font-medium text-accent hover:underline">
              Show all classes
            </Link>
          </p>
        )}
      </PageHeader>

      {activeNotEnrolled > 0 && session && !classFilter && (
        <p className="mb-5 rounded-2xl bg-warning-soft px-4 py-3 text-footnote text-ink">
          {activeNotEnrolled} active {activeNotEnrolled === 1 ? "student has" : "students have"} no class in {session.name}. Filter by <b>Class → Not enrolled</b> to find them.
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
