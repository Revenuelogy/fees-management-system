import "server-only";
import type { Viewer } from "@/server/auth/session";
import { read, write } from "@/server/data";
import type { Db } from "@/server/db";
import { ApiError, badRequest, notFound } from "@/server/http";
import { listJoin, plural } from "@/lib/text";
import type {
  ClassSetupRow,
  FeeHeadSetupRow,
  FeeStructureData,
  Installment,
  PromotePreview,
  Reconciliation,
  SessionSetupRow,
  SetupChecklist,
} from "@/lib/types";

// Setup screens: sessions & installments, classes & fee heads, fee structure, promotion. Every write here
// also drops the cached figures (write() invalidates all data reads).

const fail = (message: string) => new ApiError(400, message);

/** Classes with at least one non-zero amount in the session's fee structure. */
function classesWithStructure(db: Db, sessionId: string) {
  return db
    .query<{ class_id: string }>(
      `select distinct f.class_id from public.fee_structures f join public.installments i on i.id = f.installment_id
        where i.session_id = $1 and f.amount > 0`,
      [sessionId],
    )
    .then((rows) => rows.map((r) => r.class_id));
}

async function reconciliationCheck(db: Db, sessionId: string, key: string) {
  const recon = await db.rpc<Reconciliation>("reconciliation", { p_session: sessionId });
  return recon?.checks?.find((c) => c.key === key) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------------------------

export function checklist(viewer: Viewer, sessionId: string | null) {
  return read(viewer, "setup-checklist", [sessionId], async (db): Promise<SetupChecklist> => {
    const heads = await db.count("select 1 from public.fee_heads where is_active");
    if (!sessionId) return { active_heads: heads, installments: [], classes_with_structure: [], enrolled: 0, without_plan: null };
    const [installments, withStructure, enrolled, noPlan] = await Promise.all([
      db.query<Installment>("select id, session_id, number, name, due_date from public.installments where session_id = $1 order by number", [sessionId]),
      classesWithStructure(db, sessionId),
      db.count(
        "select 1 from public.enrollments e join public.students s on s.id = e.student_id and s.status = 'active' where e.session_id = $1",
        [sessionId],
      ),
      reconciliationCheck(db, sessionId, "enrolled_without_plan"),
    ]);
    return {
      active_heads: heads,
      installments,
      classes_with_structure: withStructure,
      enrolled,
      without_plan: noPlan ? Number(noPlan.left ?? 0) : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Sessions & installments
// ---------------------------------------------------------------------------------------------

export function sessionsOverview(viewer: Viewer) {
  return read(viewer, "setup-sessions", [], async (db) => {
    const [sessions, installments] = await Promise.all([
      db.query<SessionSetupRow>(
        `select s.id, s.name, s.start_date, s.end_date, s.is_current,
                (select count(*) from public.enrollments e where e.session_id = s.id) as enrollments,
                (select count(*) from public.payments p where p.session_id = s.id) as payments,
                (select count(*) from public.student_charges c where c.session_id = s.id) as charges
           from public.academic_sessions s order by s.start_date desc`,
      ),
      db.query<SessionSetupRow["installments"][number] & { session_id: string }>(
        `select i.id, i.session_id, i.number, i.name, i.due_date,
                (select count(*) from public.student_charges c where c.installment_id = i.id) as charges
           from public.installments i order by i.number`,
      ),
    ]);
    return sessions.map((s) => ({ ...s, installments: installments.filter((i) => i.session_id === s.id) }));
  });
}

export async function createSession(
  viewer: Viewer,
  input: { name: string; start_date: string; end_date: string; installments: { name: string | null; due_date: string }[]; make_current: boolean; copy_from: string | null },
) {
  if (input.end_date <= input.start_date) throw fail("The end date must be after the start date.");
  if (input.installments.length === 0) throw fail("Add at least one installment.");
  const installments = input.installments.map((r, i) => ({ number: i + 1, name: r.name || `Installment ${i + 1}`, due_date: r.due_date }));
  await write(viewer, (db) =>
    db.rpc("create_session", {
      p_name: input.name,
      p_start: input.start_date,
      p_end: input.end_date,
      p_installments: installments,
      p_make_current: input.make_current,
      p_copy_from: input.copy_from,
    }),
  );
  return {
    message: `Session ${input.name} created with ${plural(installments.length, "installment")}${input.copy_from ? ", fee structure copied" : ""}${
      input.make_current ? " and marked as current" : ""
    }.`,
  };
}

export async function makeCurrent(viewer: Viewer, id: string) {
  await write(viewer, (db) => db.rpc("set_current_session", { p_session: id }));
  return { message: "Marked as the current session." };
}

export async function updateSession(viewer: Viewer, id: string, input: { name: string; start_date: string; end_date: string }) {
  if (input.end_date <= input.start_date) throw fail("The end date must be after the start date.");
  const row = await write(viewer, (db) =>
    db.one("update public.academic_sessions set name = $2, start_date = $3, end_date = $4 where id = $1 returning id", [
      id,
      input.name,
      input.start_date,
      input.end_date,
    ]),
  );
  if (!row) throw notFound("That session no longer exists.");
  return { message: "Session details saved." };
}

export async function deleteSession(viewer: Viewer, id: string) {
  return write(viewer, async (db) => {
    const session = await db.one<{ name: string }>("select name from public.academic_sessions where id = $1", [id]);
    if (!session) throw notFound("That session no longer exists.");
    // Deleting a session cascades to its enrolments, installments and charges, so refuse while it holds data.
    const [enr, pay, chg] = await Promise.all([
      db.count("select 1 from public.enrollments where session_id = $1", [id]),
      db.count("select 1 from public.payments where session_id = $1 or session_hint_id = $1", [id]),
      db.count("select 1 from public.student_charges where session_id = $1", [id]),
    ]);
    const inUse: string[] = [];
    if (enr) inUse.push(plural(enr, "enrolment"));
    if (pay) inUse.push(plural(pay, "payment"));
    if (chg) inUse.push(plural(chg, "fee charge"));
    if (inUse.length) {
      throw fail(`${session.name} cannot be deleted because it has ${listJoin(inUse)}. Sessions with students or payments are kept for history.`);
    }
    await db.query("delete from public.academic_sessions where id = $1", [id]);
    return { message: `Session ${session.name} deleted.` };
  });
}

export async function addInstallment(viewer: Viewer, sessionId: string, input: { number: number; name: string | null; due_date: string }) {
  const name = input.name || `Installment ${input.number}`;
  await write(viewer, (db) =>
    db.query("insert into public.installments (session_id, number, name, due_date) values ($1, $2, $3, $4)", [sessionId, input.number, name, input.due_date]),
  );
  return { message: `${name} added. Fill in its amounts on the fee structure page.` };
}

export async function updateInstallment(viewer: Viewer, id: string, input: { name: string; due_date: string }) {
  const row = await write(viewer, (db) =>
    db.one("update public.installments set name = $2, due_date = $3 where id = $1 returning id", [id, input.name, input.due_date]),
  );
  if (!row) throw notFound("That installment no longer exists.");
  return { message: "Saved." };
}

export async function deleteInstallment(viewer: Viewer, id: string) {
  return write(viewer, async (db) => {
    const inst = await db.one<{ name: string }>("select name from public.installments where id = $1", [id]);
    if (!inst) throw notFound("That installment no longer exists.");
    const [chg, hint] = await Promise.all([
      db.count("select 1 from public.student_charges where installment_id = $1", [id]),
      db.count("select 1 from public.payments where installment_hint_id = $1", [id]),
    ]);
    if (chg) {
      throw fail(
        `${inst.name} cannot be deleted: ${plural(chg, "student charge is", "student charges are")} billed against it. Rename it or change its due date instead.`,
      );
    }
    if (hint) throw fail(`${inst.name} cannot be deleted: ${plural(hint, "imported payment refers", "imported payments refer")} to it.`);
    await db.query("delete from public.installments where id = $1", [id]);
    return { message: `${inst.name} deleted.` };
  });
}

// ---------------------------------------------------------------------------------------------
// Classes & fee heads
// ---------------------------------------------------------------------------------------------

export function classesOverview(viewer: Viewer, sessionId: string | null) {
  return read(viewer, "setup-classes", [sessionId], async (db) => {
    const [classes, heads] = await Promise.all([
      db.query<ClassSetupRow>(
        `select c.id, c.name, c.sort_order, c.is_active,
                (select count(*) from public.enrollments e where e.class_id = c.id) as enrolments,
                (select count(*) from public.enrollments e where e.class_id = c.id and e.session_id = $1) as "inSession",
                (select count(*) from public.fee_structures f where f.class_id = c.id) as structure
           from public.classes c order by c.sort_order, c.name`,
        [sessionId],
      ),
      db.query<FeeHeadSetupRow>(
        `select h.id, h.name, h.priority, h.is_active,
                (select count(*) from public.student_charges c where c.fee_head_id = h.id) as charges,
                (select count(*) from public.fee_structures f where f.fee_head_id = h.id) as structure
           from public.fee_heads h order by h.priority, h.name`,
      ),
    ]);
    return { classes, heads };
  });
}

type ClassInput = { name: string; sort_order: number; is_active: boolean };

export async function addClass(viewer: Viewer, input: ClassInput) {
  await write(viewer, (db) =>
    db.query("insert into public.classes (name, sort_order, is_active) values ($1, $2, $3)", [input.name, input.sort_order, input.is_active]),
  );
  return { message: `${input.name} added. Set its amounts on the fee structure page.` };
}

export async function updateClass(viewer: Viewer, id: string, input: ClassInput) {
  const row = await write(viewer, (db) =>
    db.one("update public.classes set name = $2, sort_order = $3, is_active = $4 where id = $1 returning id", [id, input.name, input.sort_order, input.is_active]),
  );
  if (!row) throw notFound("That class no longer exists.");
  return { message: "Saved." };
}

export async function deleteClass(viewer: Viewer, id: string) {
  return write(viewer, async (db) => {
    const cls = await db.one<{ name: string }>("select name from public.classes where id = $1", [id]);
    if (!cls) throw notFound("That class no longer exists.");
    const count = await db.count("select 1 from public.enrollments where class_id = $1", [id]);
    if (count) {
      throw fail(
        `${cls.name} cannot be deleted: ${plural(count, "student enrolment uses", "student enrolments use")} it (all sessions). Untick “Active” to hide it instead.`,
      );
    }
    await db.query("delete from public.classes where id = $1", [id]);
    return { message: `${cls.name} deleted.` };
  });
}

type FeeHeadInput = { name: string; priority: number; is_active: boolean };

export async function addFeeHead(viewer: Viewer, input: FeeHeadInput) {
  await write(viewer, (db) =>
    db.query("insert into public.fee_heads (name, priority, is_active) values ($1, $2, $3)", [input.name, input.priority, input.is_active]),
  );
  return { message: `${input.name} added.` };
}

export async function updateFeeHead(viewer: Viewer, id: string, input: FeeHeadInput) {
  return write(viewer, async (db) => {
    const before = await db.one<{ priority: number }>("select priority from public.fee_heads where id = $1", [id]);
    if (!before) throw notFound("That fee head no longer exists.");
    // a new priority re-runs payment allocation for every student (database trigger)
    await db.query("update public.fee_heads set name = $2, priority = $3, is_active = $4 where id = $1", [id, input.name, input.priority, input.is_active]);
    return { message: before.priority !== input.priority ? "Saved. Payment allocation was re-run for every student." : "Saved." };
  });
}

export async function deleteFeeHead(viewer: Viewer, id: string) {
  return write(viewer, async (db) => {
    const head = await db.one<{ name: string }>("select name from public.fee_heads where id = $1", [id]);
    if (!head) throw notFound("That fee head no longer exists.");
    const [chg, fs, pay, alloc] = await Promise.all([
      db.count("select 1 from public.student_charges where fee_head_id = $1", [id]),
      db.count("select 1 from public.fee_structures where fee_head_id = $1", [id]),
      db.count("select 1 from public.payments where fee_head_hint_id = $1", [id]),
      db.count("select 1 from public.allocations where fee_head_id = $1", [id]),
    ]);
    const uses: string[] = [];
    if (chg) uses.push(plural(chg, "student charge"));
    if (fs) uses.push(plural(fs, "fee-structure amount"));
    if (pay) uses.push(plural(pay, "imported payment"));
    if (alloc && !chg) uses.push(plural(alloc, "payment allocation"));
    if (uses.length) throw fail(`${head.name} cannot be deleted: it is used by ${listJoin(uses)}. Untick “Active” to hide it instead.`);
    await db.query("delete from public.fee_heads where id = $1", [id]);
    return { message: `${head.name} deleted.` };
  });
}

// ---------------------------------------------------------------------------------------------
// Fee structure
// ---------------------------------------------------------------------------------------------

const cellKey = (headId: string, instId: string) => `${headId}|${instId}`;

/** One class's amounts in a session, with what the editor shows around them. */
export function feeStructure(viewer: Viewer, sessionId: string, classId: string) {
  return read(viewer, "fee-structure", [sessionId, classId], async (db): Promise<FeeStructureData> => {
    const [installments, heads, cells, withStructure, students, noPlan] = await Promise.all([
      db.query<Installment>("select id, session_id, number, name, due_date from public.installments where session_id = $1 order by number", [sessionId]),
      db.query<FeeStructureData["heads"][number]>("select id, name, priority, is_active from public.fee_heads order by priority, name"),
      db.query<{ installment_id: string; fee_head_id: string; amount: number }>(
        `select f.installment_id, f.fee_head_id, f.amount from public.fee_structures f
           join public.installments i on i.id = f.installment_id where f.class_id = $1 and i.session_id = $2`,
        [classId, sessionId],
      ),
      classesWithStructure(db, sessionId),
      db.one<{ enrolled: number; with_charges: number }>(
        `select count(*) as enrolled,
                count(*) filter (where exists (select 1 from public.student_charges sc where sc.student_id = e.student_id and sc.session_id = e.session_id)) as with_charges
           from public.enrollments e join public.students s on s.id = e.student_id and s.status = 'active'
          where e.session_id = $1 and e.class_id = $2`,
        [sessionId, classId],
      ),
      reconciliationCheck(db, sessionId, "enrolled_without_plan"),
    ]);
    const amounts: Record<string, number> = {};
    for (const c of cells) amounts[cellKey(c.fee_head_id, c.installment_id)] = c.amount;
    return {
      installments,
      heads,
      amounts,
      classes_with_structure: withStructure,
      enrolled: students?.enrolled ?? 0,
      with_charges: students?.with_charges ?? 0,
      no_plan: noPlan,
    };
  });
}

/** Save a class's amounts: positive amounts are upserted, zero removes the cell. */
export async function saveStructure(viewer: Viewer, sessionId: string, classId: string, cells: { installment_id: string; fee_head_id: string; amount: number }[]) {
  return write(viewer, async (db) => {
    const [inst, heads] = await Promise.all([
      db.query<{ id: string }>("select id from public.installments where session_id = $1", [sessionId]),
      db.query<{ id: string }>("select id from public.fee_heads"),
    ]);
    const instIds = new Set(inst.map((i) => i.id));
    const headIds = new Set(heads.map((h) => h.id));
    if (cells.some((c) => !instIds.has(c.installment_id) || !headIds.has(c.fee_head_id))) {
      throw new ApiError(409, "The page is out of date. Reload it and try again.");
    }
    const upserts = cells.filter((c) => c.amount > 0);
    const zeros = cells.filter((c) => c.amount === 0);
    for (const c of upserts) {
      await db.query(
        `insert into public.fee_structures (class_id, installment_id, fee_head_id, amount) values ($1, $2, $3, $4)
         on conflict (class_id, installment_id, fee_head_id) do update set amount = excluded.amount`,
        [classId, c.installment_id, c.fee_head_id, c.amount],
      );
    }
    for (const c of zeros) {
      await db.query("delete from public.fee_structures where class_id = $1 and installment_id = $2 and fee_head_id = $3", [classId, c.installment_id, c.fee_head_id]);
    }
    return { message: `Saved ${plural(upserts.length, "amount")}. Students' charges change only when you apply the structure below.` };
  });
}

/** Replace a class's amounts in the session with another class's. */
export async function copyStructure(viewer: Viewer, sessionId: string, classId: string, fromId: string) {
  if (fromId === classId) throw fail("Choose a different class to copy from.");
  return write(viewer, async (db) => {
    const instCount = await db.count("select 1 from public.installments where session_id = $1", [sessionId]);
    if (!instCount) throw fail("This session has no installments.");
    const from = await db.one<{ name: string }>("select name from public.classes where id = $1", [fromId]);
    const src = await db.query<{ installment_id: string; fee_head_id: string; amount: number }>(
      `select f.installment_id, f.fee_head_id, f.amount from public.fee_structures f
         join public.installments i on i.id = f.installment_id where f.class_id = $1 and i.session_id = $2`,
      [fromId, sessionId],
    );
    const fromName = from?.name ?? "that class";
    if (src.length === 0) throw fail(`${fromName} has no amounts in this session to copy.`);
    await db.query(
      `delete from public.fee_structures f using public.installments i
        where i.id = f.installment_id and f.class_id = $1 and i.session_id = $2`,
      [classId, sessionId],
    );
    await db.query(
      `insert into public.fee_structures (class_id, installment_id, fee_head_id, amount)
       select $1, f.installment_id, f.fee_head_id, f.amount from public.fee_structures f
         join public.installments i on i.id = f.installment_id where f.class_id = $2 and i.session_id = $3`,
      [classId, fromId, sessionId],
    );
    const amounts: Record<string, number> = {};
    for (const r of src) amounts[cellKey(r.fee_head_id, r.installment_id)] = r.amount;
    return { message: `Copied ${plural(src.length, "amount")} from ${fromName}.`, amounts };
  });
}

/** Create (or with `overwrite`, sync) students' charges from the structure: one class, or all (classId null). */
export async function applyStructure(viewer: Viewer, sessionId: string, classId: string | null, overwrite: boolean) {
  return write(viewer, async (db) => {
    const cls = classId ? await db.one<{ name: string }>("select name from public.classes where id = $1", [classId]) : null;
    if (classId && !cls) throw notFound("That class no longer exists.");
    const n = Number(await db.rpc<number>("generate_charges", { p_session: sessionId, p_class: classId, p_student: null, p_overwrite: overwrite }));
    const target = cls ? cls.name : "all classes";
    return {
      message:
        n === 0
          ? `Nothing to change in ${target}: no student was missing a charge${overwrite ? " or had a different amount" : ""}.`
          : `Applied to ${target}: ${plural(n, "charge line")} added${overwrite ? ", updated or removed" : ""}.`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------------------------

/** Students per class in `fromId` (active / inactive / already in `toId`) and the target classes with fees. */
export function promotePreview(viewer: Viewer, fromId: string, toId: string) {
  return read(viewer, "promote-preview", [fromId, toId], async (db): Promise<PromotePreview> => {
    const [byClass, withStructure, targetEnrolled] = await Promise.all([
      db.query<PromotePreview["by_class"][number]>(
        `select e.class_id,
                count(*) filter (where s.status = 'active') as active,
                count(*) filter (where s.status <> 'active') as inactive,
                count(*) filter (where s.status = 'active' and exists (
                  select 1 from public.enrollments t where t.student_id = e.student_id and t.session_id = $2)) as already
           from public.enrollments e join public.students s on s.id = e.student_id
          where e.session_id = $1
          group by e.class_id`,
        [fromId, toId],
      ),
      classesWithStructure(db, toId),
      db.count("select 1 from public.enrollments where session_id = $1", [toId]),
    ]);
    return { by_class: byClass, target_has_structure: withStructure, target_enrolled: targetEnrolled };
  });
}

export async function promote(viewer: Viewer, input: { from: string; to: string; mapping: { from_class: string; to_class: string | null }[]; generate: boolean }) {
  if (input.from === input.to) throw badRequest("Choose two different sessions.");
  if (input.mapping.length === 0) throw badRequest("Every class is set to “Do not promote”. Choose at least one target class.");
  const r = await write(viewer, (db) =>
    db.rpc<{ promoted: number; passed_out: number; skipped: number }>("promote_students", {
      p_from: input.from,
      p_to: input.to,
      p_mapping: input.mapping,
      p_generate: input.generate,
    }),
  );
  const parts = [`Promoted ${plural(r.promoted, "student")}`];
  if (r.passed_out) parts.push(`marked ${plural(r.passed_out, "student")} as passed out`);
  if (r.skipped) parts.push(`left ${plural(r.skipped, "student")} alone who were already enrolled in the target session`);
  return {
    result: r,
    message: `${parts.join(", ")}.${input.generate && r.promoted ? " Charges were generated from the target session's fee structure." : ""}`,
  };
}
