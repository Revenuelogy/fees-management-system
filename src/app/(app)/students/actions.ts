// Form handlers for student records. They call the API (src/app/api/students) and refresh the screen.

import { api, errorMessage, refreshAll, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import { isIsoDate, isUuid, text } from "./helpers";

function readStudent(formData: FormData) {
  const gender = text(formData, "gender");
  return {
    admission_no: text(formData, "admission_no"),
    full_name: text(formData, "full_name"),
    father_name: text(formData, "father_name"),
    mother_name: text(formData, "mother_name"),
    phone: text(formData, "phone"),
    alt_phone: text(formData, "alt_phone"),
    email: text(formData, "email"),
    dob: text(formData, "dob"),
    gender: gender === "M" || gender === "F" || gender === "O" ? gender : null,
    address: text(formData, "address"),
    admission_date: text(formData, "admission_date"),
    remarks: text(formData, "remarks"),
  };
}

function validateStudent(s: ReturnType<typeof readStudent>): string | null {
  if (!s.admission_no) return "Enter the admission number.";
  if (!s.full_name) return "Enter the student's full name.";
  if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) return "The email address does not look right.";
  if (s.dob && !isIsoDate(s.dob)) return "Date of birth is not a valid date.";
  if (s.admission_date && !isIsoDate(s.admission_date)) return "Admission date is not a valid date.";
  return null;
}

/** Create (no id) or update (id) a student, and enrol them in the active session when a class is chosen. */
export async function saveStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  const sessionId = text(formData, "session_id");
  const classId = text(formData, "class_id");

  const student = readStudent(formData);
  const invalid = validateStudent(student);
  if (invalid) return { error: invalid };
  if (id && !isUuid(id)) return { error: "Unknown student." };
  if (classId && !isUuid(classId)) return { error: "Choose a valid class." };
  if (classId && !isUuid(sessionId)) return { error: "There is no academic session to enrol the student in." };

  const body = {
    student,
    enrolment:
      classId && sessionId
        ? { session_id: sessionId, class_id: classId, section: text(formData, "section") ?? "A", roll_no: text(formData, "roll_no"), generate: formData.get("generate") === "on" }
        : null,
  };

  if (!id) {
    return submit(
      () => api.post<{ id: string; enrolFailed: boolean }>("/api/students", body),
      (r) => ({ ok: true, redirect: r.enrolFailed ? `/students/${r.id}/edit?warn=enrol` : `/students/${r.id}` }),
    );
  }
  try {
    const r = await api.put<{ message: string }>(`/api/students/${id}`, body);
    await refreshAll();
    return { ok: true, message: r.message };
  } catch (e) {
    // the details may have been saved even when the enrolment was refused
    void refreshAll();
    return { error: errorMessage(e) };
  }
}

export async function withdrawStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  const leftOn = text(formData, "left_on");
  if (!isUuid(id)) return { error: "Unknown student." };
  if (!isIsoDate(leftOn)) return { error: "Enter the date the student left." };
  return submit(
    () => api.post<{ message: string }>(`/api/students/${id}/withdraw`, { left_on: leftOn, waive: formData.get("waive") === "on" }),
    (r) => ({ ok: true, message: r.message }),
  );
}

export async function reactivateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Unknown student." };
  return submit(
    () => api.post<{ message: string }>(`/api/students/${id}/reactivate`, { restore: formData.get("restore") === "on" }),
    (r) => ({ ok: true, message: r.message }),
  );
}

export async function deleteStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  if (!isUuid(id)) return { error: "Unknown student." };
  const confirm = text(formData, "confirm") ?? "";
  try {
    await api.delete(`/api/students/${id}?confirm=${encodeURIComponent(confirm)}`);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  await refreshAll(id); // the open page's own record is gone; do not refetch it
  return { ok: true, redirect: "/students" };
}
