"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { isIsoDate, isUuid, text } from "./helpers";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function revalidateStudent(id?: string) {
  // Student names, classes and fee plans show up on almost every page.
  revalidatePath("/", "layout");
  if (id) revalidatePath(`/students/${id}`);
}

/** Best-effort audit entry; never blocks the action. */
async function audit(supabase: Supabase, action: string, entityId: string, details: Record<string, unknown>) {
  await supabase.rpc("audit", { p_action: action, p_entity: "students", p_entity_id: entityId, p_details: details });
}

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
  await requireWriter();
  const id = text(formData, "id");
  const sessionId = text(formData, "session_id");
  const classId = text(formData, "class_id");
  const section = text(formData, "section") ?? "A";
  const rollNo = text(formData, "roll_no");
  const generate = formData.get("generate") === "on";

  const student = readStudent(formData);
  const invalid = validateStudent(student);
  if (invalid) return { error: invalid };
  if (id && !isUuid(id)) return { error: "Unknown student." };
  if (classId && !isUuid(classId)) return { error: "Choose a valid class." };
  if (classId && !isUuid(sessionId)) return { error: "There is no academic session to enrol the student in." };

  const supabase = await createClient();

  // ---- create -------------------------------------------------------------
  if (!id) {
    const { data, error } = await supabase.from("students").insert(student).select("id").single();
    if (error || !data) return { error: friendlyError(error) };
    const newId = (data as { id: string }).id;

    let enrolFailed = false;
    if (classId && sessionId) {
      const { error: enrolError } = await supabase.rpc("enroll_student", {
        p_student: newId,
        p_session: sessionId,
        p_class: classId,
        p_section: section,
        p_roll_no: rollNo,
        p_generate: generate,
      });
      enrolFailed = !!enrolError;
    }
    revalidateStudent(newId);
    redirect(enrolFailed ? `/students/${newId}/edit?warn=enrol` : `/students/${newId}`);
  }

  // ---- update -------------------------------------------------------------
  const { data: existing, error: loadError } = await supabase.from("students").select("id").eq("id", id).maybeSingle();
  if (loadError) return { error: friendlyError(loadError) };
  if (!existing) return { error: "This student no longer exists." };

  const { error } = await supabase.from("students").update(student).eq("id", id);
  if (error) return { error: friendlyError(error) };

  const notes: string[] = [];
  if (classId && sessionId) {
    const { data: enrolment } = await supabase
      .from("enrollments")
      .select("class_id, section, roll_no")
      .eq("student_id", id)
      .eq("session_id", sessionId)
      .maybeSingle();
    const current = enrolment as { class_id: string; section: string; roll_no: string | null } | null;
    const classChanged = !current || current.class_id !== classId;
    const changed = classChanged || current.section !== section || (current.roll_no ?? null) !== rollNo;

    if (changed) {
      // Only (re)generate when the class is new or changed, or the student has no plan yet in this
      // session. Otherwise a routine edit would quietly re-add lines that were removed on purpose.
      let runGenerate = generate && classChanged;
      if (generate && !classChanged) {
        const { count } = await supabase
          .from("student_charges")
          .select("id", { count: "exact", head: true })
          .eq("student_id", id)
          .eq("session_id", sessionId);
        runGenerate = (count ?? 0) === 0;
      }
      const { error: enrolError } = await supabase.rpc("enroll_student", {
        p_student: id,
        p_session: sessionId,
        p_class: classId,
        p_section: section,
        p_roll_no: rollNo,
        p_generate: runGenerate,
      });
      if (enrolError) {
        revalidateStudent(id);
        return { error: `Details saved, but the enrolment could not be updated: ${friendlyError(enrolError)}` };
      }
      if (!current) notes.push(runGenerate ? "Enrolled and fee charges generated from the class fee structure." : "Enrolled.");
      else if (classChanged) notes.push(runGenerate ? "Class changed and fee charges re-synced to the new class." : "Class changed (fee charges left as they were).");
      else notes.push("Section / roll number updated.");
    }
  }

  revalidateStudent(id);
  return { ok: true, message: ["Saved.", ...notes].join(" ") };
}

export async function withdrawStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const id = text(formData, "id");
  const leftOn = text(formData, "left_on");
  const waive = formData.get("waive") === "on";
  if (!isUuid(id)) return { error: "Unknown student." };
  if (!isIsoDate(leftOn)) return { error: "Enter the date the student left." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("withdraw_student", { p_student: id, p_left_on: leftOn, p_waive_future: waive });
  if (error) return { error: friendlyError(error) };
  revalidateStudent(id);
  const waived = Number(data ?? 0);
  return {
    ok: true,
    message: waive
      ? `Marked as left. ${waived} fee ${waived === 1 ? "line" : "lines"} due after that date ${waived === 1 ? "was" : "were"} waived.`
      : "Marked as left. Fee charges were not changed.",
  };
}

export async function reactivateStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const id = text(formData, "id");
  const restore = formData.get("restore") === "on";
  if (!isUuid(id)) return { error: "Unknown student." };

  const supabase = await createClient();
  // reactivate_student restores the concessions saved when the student was withdrawn, and audits itself
  const { data, error } = await supabase.rpc("reactivate_student", { p_student: id, p_restore: restore });
  if (error) return { error: friendlyError(error) };
  const restored = Number(data ?? 0);
  revalidateStudent(id);
  return {
    ok: true,
    message: restore
      ? `Re-activated. ${restored} waived fee ${restored === 1 ? "line was" : "lines were"} restored.`
      : "Re-activated. Fee charges were not changed.",
  };
}

export async function deleteStudent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireWriter();
  const id = text(formData, "id");
  const confirm = text(formData, "confirm");
  if (!isUuid(id)) return { error: "Unknown student." };

  const supabase = await createClient();
  const { data: student } = await supabase.from("students").select("admission_no, full_name").eq("id", id).maybeSingle();
  if (!student) return { error: "This student no longer exists." };
  const s = student as { admission_no: string; full_name: string };
  if ((confirm ?? "").toLowerCase() !== s.admission_no.toLowerCase()) {
    return { error: `Type the admission number (${s.admission_no}) to confirm.` };
  }

  const { count, error: countError } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", id);
  if (countError) return { error: friendlyError(countError) };
  if ((count ?? 0) > 0) {
    return { error: "This student has payment receipts, which are permanent. Mark the student as left instead." };
  }

  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { error: "This student has payment receipts, which are permanent. Mark the student as left instead." };
    return { error: friendlyError(error) };
  }
  await audit(supabase, "delete_student", id, { admission_no: s.admission_no, full_name: s.full_name });
  revalidatePath("/", "layout");
  redirect("/students");
}
