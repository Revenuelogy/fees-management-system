import "server-only";
import type { Viewer } from "@/server/auth/session";
import { audit, read, write } from "@/server/data";
import { isDbError, type Db } from "@/server/db";
import { ApiError, badRequest, notFound } from "@/server/http";
import { orNotFound } from "@/server/services/analytics";
import { rupees } from "@/lib/format";
import type { DueLine, FeePlanData, SearchResult, Student, Student360, StudentListRow, StudentRecord } from "@/lib/types";

// ---------------------------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------------------------

/** Every student (any status) with their enrolment in one session. */
export function list(viewer: Viewer, sessionId: string | null) {
  return read(viewer, "students", [sessionId], (db) =>
    db.query<StudentListRow>(
      `select s.id, s.admission_no, s.full_name, s.father_name, s.phone, s.status, s.left_on,
              e.class_id, c.name as class_name, c.sort_order as class_order, e.section, e.roll_no
         from public.students s
         left join public.enrollments e on e.student_id = s.id and e.session_id = $1
         left join public.classes c on c.id = e.class_id
        order by s.admission_no`,
      [sessionId],
    ),
  );
}

export function search(viewer: Viewer, q: string, limit: number) {
  return read(viewer, "student-search", [q.toLowerCase(), limit], (db) =>
    db.rpcRows<SearchResult>("search_students", { p_query: q, p_limit: limit }),
  );
}

/** A student's record, with their enrolment in `sessionId`. */
export async function get(viewer: Viewer, id: string, sessionId: string | null) {
  const rec = await read(viewer, "student", [id, sessionId], async (db): Promise<StudentRecord | null> => {
    const student = await db.one<Student>("select * from public.students where id = $1", [id]);
    if (!student) return null;
    const [enrollment, payments, waived] = await Promise.all([
      sessionId
        ? db.one<StudentRecord["enrollment"]>("select class_id, section, roll_no from public.enrollments where student_id = $1 and session_id = $2", [id, sessionId])
        : null,
      db.count("select 1 from public.payments where student_id = $1", [id]),
      db.count("select 1 from public.student_charges where student_id = $1 and concession_before_waiver is not null", [id]),
    ]);
    return { student, enrollment, payments, waived_lines: waived };
  });
  if (!rec) throw notFound("That student does not exist.");
  return rec;
}

export function student360(viewer: Viewer, id: string) {
  return orNotFound(
    read(viewer, "student-360", [id], (db) => db.rpc<Student360>("student_360", { p_student: id })),
    /not found/i,
    "That student does not exist.",
  );
}

export function dues(viewer: Viewer, id: string) {
  return read(viewer, "student-dues", [id], (db) => db.rpcRows<DueLine>("student_dues", { p_student: id }));
}

/** Everything the fee plan screen needs for one student, with the installments of `sessionId`. */
export async function feePlan(viewer: Viewer, id: string, sessionId: string) {
  const plan = await read(viewer, "fee-plan", [id, sessionId], async (db): Promise<FeePlanData | null> => {
    const student = await db.one<Student>("select * from public.students where id = $1", [id]);
    if (!student) return null;
    const [enrollments, dueLines, meta, installments, heads, advance] = await Promise.all([
      db.query<FeePlanData["enrollments"][number]>(
        `select e.session_id, e.section, e.roll_no, e.class_id, c.name as class_name
           from public.enrollments e join public.classes c on c.id = e.class_id where e.student_id = $1`,
        [id],
      ),
      db.rpcRows<DueLine>("student_dues", { p_student: id }),
      db.query<FeePlanData["meta"][number]>("select id, source, note from public.student_charges where student_id = $1", [id]),
      db.query<FeePlanData["installments"][number]>("select id, session_id, number, name, due_date from public.installments where session_id = $1 order by number", [sessionId]),
      db.query<FeePlanData["heads"][number]>("select id, name, priority, is_active from public.fee_heads order by priority, name"),
      db.one<{ amount: number }>("select coalesce(sum(amount), 0) as amount from public.allocations where student_id = $1 and charge_id is null", [id]),
    ]);
    return { student, enrollments, dues: dueLines, meta, installments, heads, advance: advance?.amount ?? 0 };
  });
  if (!plan) throw notFound("That student does not exist.");
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Student records
// ---------------------------------------------------------------------------------------------

export type StudentFields = {
  admission_no: string;
  full_name: string;
  father_name: string | null;
  mother_name: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  dob: string | null;
  gender: "M" | "F" | "O" | null;
  address: string | null;
  admission_date: string | null;
  remarks: string | null;
};

export type Enrolment = { session_id: string; class_id: string; section: string; roll_no: string | null; generate: boolean };

const FIELDS: (keyof StudentFields)[] = [
  "admission_no", "full_name", "father_name", "mother_name", "phone", "alt_phone", "email", "dob", "gender", "address",
  "admission_date", "remarks",
];

function enrol(db: Db, studentId: string, e: Enrolment, generate: boolean) {
  return db.rpc("enroll_student", {
    p_student: studentId,
    p_session: e.session_id,
    p_class: e.class_id,
    p_section: e.section,
    p_roll_no: e.roll_no,
    p_generate: generate,
  });
}

/** Create a student and, when a class is chosen, enrol them. `enrolFailed`: saved, but the enrolment was refused. */
export async function create(viewer: Viewer, fields: StudentFields, enrolment: Enrolment | null) {
  const row = await write(viewer, (db) =>
    db.one<{ id: string }>(
      `insert into public.students (${FIELDS.join(", ")}) values (${FIELDS.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
      FIELDS.map((f) => fields[f]),
    ),
  );
  const id = row!.id;
  let enrolFailed = false;
  if (enrolment) {
    try {
      await write(viewer, (db) => enrol(db, id, enrolment, enrolment.generate));
    } catch {
      enrolFailed = true;
    }
  }
  return { id, enrolFailed };
}

/** Update a student's details and, separately, their enrolment in the session of `enrolment`. */
export async function update(viewer: Viewer, id: string, fields: StudentFields, enrolment: Enrolment | null) {
  const saved = await write(viewer, (db) =>
    db.one(`update public.students set ${FIELDS.map((f, i) => `${f} = $${i + 2}`).join(", ")} where id = $1 returning id`, [
      id,
      ...FIELDS.map((f) => fields[f]),
    ]),
  );
  if (!saved) throw notFound("This student no longer exists.");

  const notes: string[] = [];
  if (enrolment) {
    const e = enrolment;
    try {
      await write(viewer, async (db) => {
        const current = await db.one<{ class_id: string; section: string; roll_no: string | null }>(
          "select class_id, section, roll_no from public.enrollments where student_id = $1 and session_id = $2",
          [id, e.session_id],
        );
        const classChanged = !current || current.class_id !== e.class_id;
        const changed = classChanged || current.section !== e.section || (current.roll_no ?? null) !== e.roll_no;
        if (!changed) return;

        // Only (re)generate when the class is new or changed, or the student has no plan yet in this
        // session. Otherwise a routine edit would quietly re-add lines that were removed on purpose.
        let runGenerate = e.generate && classChanged;
        if (e.generate && !classChanged) {
          runGenerate = (await db.count("select 1 from public.student_charges where student_id = $1 and session_id = $2", [id, e.session_id])) === 0;
        }
        await enrol(db, id, e, runGenerate);
        if (!current) notes.push(runGenerate ? "Enrolled and fee charges generated from the class fee structure." : "Enrolled.");
        else if (classChanged) notes.push(runGenerate ? "Class changed and fee charges re-synced to the new class." : "Class changed (fee charges left as they were).");
        else notes.push("Section / roll number updated.");
      });
    } catch (err) {
      const reason = isDbError(err) || err instanceof ApiError ? err.message : "unexpected error";
      throw badRequest(`Details saved, but the enrolment could not be updated: ${reason}`);
    }
  }
  return { message: ["Saved.", ...notes].join(" ") };
}

export async function withdraw(viewer: Viewer, id: string, leftOn: string, waive: boolean) {
  const waived = await write(viewer, (db) => db.rpc<number>("withdraw_student", { p_student: id, p_left_on: leftOn, p_waive_future: waive }));
  const n = Number(waived ?? 0);
  return {
    message: waive
      ? `Marked as left. ${n} fee ${n === 1 ? "line" : "lines"} due after that date ${n === 1 ? "was" : "were"} waived.`
      : "Marked as left. Fee charges were not changed.",
  };
}

export async function reactivate(viewer: Viewer, id: string, restore: boolean) {
  // reactivate_student restores the concessions saved when the student was withdrawn, and audits itself
  const restored = await write(viewer, (db) => db.rpc<number>("reactivate_student", { p_student: id, p_restore: restore }));
  const n = Number(restored ?? 0);
  return {
    message: restore ? `Re-activated. ${n} waived fee ${n === 1 ? "line was" : "lines were"} restored.` : "Re-activated. Fee charges were not changed.",
  };
}

const HAS_RECEIPTS = "This student has payment receipts, which are permanent. Mark the student as left instead.";

/** Delete a student with no receipts. `confirm` must repeat the admission number. */
export async function remove(viewer: Viewer, id: string, confirm: string) {
  await write(viewer, async (db) => {
    const s = await db.one<{ admission_no: string; full_name: string }>("select admission_no, full_name from public.students where id = $1", [id]);
    if (!s) throw notFound("This student no longer exists.");
    if (confirm.trim().toLowerCase() !== s.admission_no.toLowerCase()) throw badRequest(`Type the admission number (${s.admission_no}) to confirm.`);
    if ((await db.count("select 1 from public.payments where student_id = $1", [id])) > 0) throw badRequest(HAS_RECEIPTS);
    try {
      await db.query("delete from public.students where id = $1", [id]);
    } catch (e) {
      if (isDbError(e) && e.code === "23503") throw badRequest(HAS_RECEIPTS);
      throw e;
    }
    await audit(db, "delete_student", "students", id, { admission_no: s.admission_no, full_name: s.full_name });
  });
}

// ---------------------------------------------------------------------------------------------
// Notes & promises
// ---------------------------------------------------------------------------------------------

export async function addNote(viewer: Viewer, studentId: string, input: { note: string; promised_date: string | null; promised_amount: number | null }) {
  await write(viewer, (db) =>
    db.query("insert into public.student_notes (student_id, note, promised_date, promised_amount) values ($1, $2, $3, $4)", [
      studentId,
      input.note,
      input.promised_date,
      input.promised_amount,
    ]),
  );
}

export async function deleteNote(viewer: Viewer, studentId: string, noteId: string) {
  const row = await write(viewer, (db) => db.one("delete from public.student_notes where id = $1 and student_id = $2 returning id", [noteId, studentId]));
  if (!row) throw notFound("That note no longer exists.");
}

// ---------------------------------------------------------------------------------------------
// Fee plan (charges)
// ---------------------------------------------------------------------------------------------

/** Money currently allocated to one charge (paise). */
async function allocatedTo(db: Db, chargeId: string): Promise<number> {
  return (await db.one<{ paid: number }>("select coalesce(sum(amount), 0) as paid from public.allocations where charge_id = $1", [chargeId]))?.paid ?? 0;
}

export async function updateCharge(viewer: Viewer, studentId: string, chargeId: string, amount: number, concession: number) {
  if (concession > amount) throw badRequest("Concession cannot be more than the amount.");
  return write(viewer, async (db) => {
    const current = await db.one<{ amount: number; concession: number; source: string }>(
      "select amount, concession, source from public.student_charges where id = $1 and student_id = $2",
      [chargeId, studentId],
    );
    if (!current) throw notFound("This fee line no longer exists.");
    if (current.amount === amount && current.concession === concession) return { message: "No changes." };

    const paid = await allocatedTo(db, chargeId);
    // A hand-edited amount must survive "re-generate from class structure" (which only touches 'structure' lines).
    const source = current.amount !== amount && current.source === "structure" ? "manual" : current.source;
    await db.query("update public.student_charges set amount = $3, concession = $4, source = $5 where id = $1 and student_id = $2", [
      chargeId,
      studentId,
      amount,
      concession,
      source,
    ]);
    await audit(db, "edit_charge", "student_charges", chargeId, {
      student: studentId,
      amount_from: current.amount,
      amount,
      concession_from: current.concession,
      concession,
    });
    const net = amount - concession;
    return { message: paid > net ? `Saved. ${rupees(paid - net)} that was paid against this line moved to other dues (or advance).` : "Saved." };
  });
}

export async function deleteCharge(viewer: Viewer, studentId: string, chargeId: string) {
  return write(viewer, async (db) => {
    const paid = await allocatedTo(db, chargeId);
    const row = await db.one<Record<string, unknown>>(
      "delete from public.student_charges where id = $1 and student_id = $2 returning amount, concession, fee_head_id, installment_id",
      [chargeId, studentId],
    );
    if (!row) throw notFound("This fee line no longer exists.");
    await audit(db, "delete_charge", "student_charges", chargeId, { student: studentId, ...row, paid });
    return { message: paid > 0 ? `Line deleted. ${rupees(paid)} paid against it moved to other dues (or advance).` : "Line deleted." };
  });
}

export async function addCharge(
  viewer: Viewer,
  studentId: string,
  input: { installment_id: string; fee_head_id: string; amount: number; concession: number; note: string | null },
) {
  if (input.amount <= 0) throw badRequest("Enter an amount greater than zero (₹).");
  if (input.concession > input.amount) throw badRequest("Concession cannot be more than the amount.");
  return write(viewer, async (db) => {
    const inst = await db.one<{ session_id: string }>("select session_id from public.installments where id = $1", [input.installment_id]);
    if (!inst) throw notFound("That installment no longer exists.");
    let row: { id: string } | null;
    try {
      row = await db.one<{ id: string }>(
        `insert into public.student_charges (student_id, session_id, installment_id, fee_head_id, amount, concession, source, note)
         values ($1, $2, $3, $4, $5, $6, 'manual', $7) returning id`,
        [studentId, inst.session_id, input.installment_id, input.fee_head_id, input.amount, input.concession, input.note],
      );
    } catch (e) {
      if (isDbError(e) && e.code === "23505") throw new ApiError(409, "This installment already has a line for that fee head. Edit that line instead.");
      throw e;
    }
    await audit(db, "add_charge", "student_charges", row!.id, { student: studentId, amount: input.amount, concession: input.concession });
    return { message: `Added a ${rupees(input.amount)} line.` };
  });
}

export async function applyConcession(
  viewer: Viewer,
  studentId: string,
  input: { session_id: string; fee_head_id: string | null; mode: "percent" | "amount" | "clear"; value: number; from_installment: number },
) {
  const n = Number(
    await write(viewer, (db) =>
      db.rpc<number>("apply_concession", {
        p_student: studentId,
        p_session: input.session_id,
        p_fee_head: input.fee_head_id,
        p_mode: input.mode,
        p_value: input.value,
        p_from_installment: input.from_installment,
      }),
    ),
  );
  if (n === 0) return { message: "No fee lines matched, so nothing changed." };
  const what =
    input.mode === "clear" ? "Concession cleared" : input.mode === "percent" ? `${input.value}% concession applied` : `${rupees(input.value)} concession applied`;
  return { message: `${what} on ${n} fee ${n === 1 ? "line" : "lines"}.` };
}

export async function regenerate(viewer: Viewer, studentId: string, sessionId: string, overwrite: boolean) {
  const n = Number(
    await write(viewer, (db) => db.rpc<number>("generate_charges", { p_session: sessionId, p_class: null, p_student: studentId, p_overwrite: overwrite })),
  );
  return { message: n === 0 ? "Already matches the class fee structure; nothing changed." : `${n} fee ${n === 1 ? "line" : "lines"} added or updated.` };
}

export async function addOpeningDue(viewer: Viewer, studentId: string, input: { session_id: string; amount: number; fee_head: string; note: string | null }) {
  if (input.amount <= 0) throw badRequest("Enter an amount greater than zero (₹).");
  return write(viewer, async (db) => {
    const session = await db.one<{ name: string }>("select name from public.academic_sessions where id = $1", [input.session_id]);
    if (!session) throw notFound("That session does not exist.");
    const chargeId = await db.rpc<string>("add_opening_due", {
      p_student: studentId,
      p_session: input.session_id,
      p_amount: input.amount,
      p_fee_head: input.fee_head,
      p_note: input.note,
    });
    await audit(db, "add_opening_due", "student_charges", chargeId, { student: studentId, session: input.session_id, amount: input.amount, fee_head: input.fee_head });
    return { message: `Added ${rupees(input.amount)} of ${input.fee_head} to ${session.name}.`, session_id: input.session_id };
  });
}
