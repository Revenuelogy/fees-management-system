import "server-only";
import type { Viewer } from "@/server/auth/session";
import { read } from "@/server/data";
import { isDbError, type Db } from "@/server/db";
import { notFound } from "@/server/http";
import type {
  ClassDetail,
  ClassFeeLines,
  ClassSummaryRow,
  CollectionTarget,
  Dashboard,
  FeePosition,
  InstallmentDetail,
  InstallmentRow,
  MonthClassDetail,
  MonthPayment,
  MonthSummary,
  NonPayer,
  Reconciliation,
  StudentBalance,
  TargetProgress,
} from "@/lib/types";

// Every figure comes from the SQL functions in db/migrations/*_analytics.sql; this file only calls them.

/** Turn the SQL "Unknown …" / "… not found" exceptions into a 404. */
export async function orNotFound<T>(run: Promise<T>, pattern: RegExp, message?: string): Promise<T> {
  try {
    return await run;
  } catch (e) {
    if (isDbError(e) && e.code === "P0001" && pattern.test(e.message)) throw notFound(message);
    throw e;
  }
}

const monthDate = (month: string) => `${month}-01`;

export function dashboard(viewer: Viewer, sessionId: string, arrears: boolean) {
  return orNotFound(
    read(viewer, "dashboard", [sessionId, arrears], (db) => db.rpc<Dashboard>("dashboard", { p_session: sessionId, p_include_arrears: arrears })),
    /^Unknown session/,
    "That session does not exist.",
  );
}

/** Students with the highest overdue amounts (this session's, or including previous dues). */
export function defaulters(viewer: Viewer, sessionId: string, arrears: boolean, limit: number) {
  const key = arrears ? "total_overdue" : "overdue";
  return read(viewer, "defaulters", [sessionId, arrears, limit], (db) =>
    db.rpcRows<StudentBalance>("student_balances", { p_session: sessionId }, (p) => `where ${key} > 0 order by ${key} desc, full_name limit ${p(limit)}`),
  );
}

/** Per-student balances for a session, optionally for one class (and section). */
export function balances(viewer: Viewer, sessionId: string, filter: { classId?: string; section?: string } = {}) {
  return read(viewer, "balances", [sessionId, filter.classId ?? null, filter.section ?? null], (db) =>
    db.rpcRows<StudentBalance>("student_balances", { p_session: sessionId }, (p) => {
      const where: string[] = [];
      if (filter.classId) where.push(`class_id = ${p(filter.classId)}`);
      if (filter.section) where.push(`section = ${p(filter.section)}`);
      return `${where.length ? `where ${where.join(" and ")}` : ""} order by class_order nulls last, section, full_name, student_id`;
    }),
  );
}

export function classSummary(viewer: Viewer, sessionId: string, arrears: boolean) {
  return read(viewer, "class-summary", [sessionId, arrears], (db) =>
    db.rpc<ClassSummaryRow[] | null>("class_summary", { p_session: sessionId, p_include_arrears: arrears }).then((r) => r ?? []),
  );
}

/** Every total of the year (this year, past years, both) for the school, a class or one section of it. */
export function feePosition(viewer: Viewer, sessionId: string, classId: string | null, section: string | null) {
  return orNotFound(
    read(viewer, "fee-position", [sessionId, classId, section], (db) =>
      db.rpc<FeePosition>("fee_position", { p_session: sessionId, p_class: classId ?? undefined, p_section: section ?? undefined }),
    ),
    /^Unknown/,
  );
}

/** One installment and/or fee type (all fees when neither) for every student of a class (or one section). */
export function classFeeLines(
  viewer: Viewer,
  sessionId: string,
  classId: string,
  f: { installmentId: string | null; feeHeadId: string | null; section: string | null },
) {
  return orNotFound(
    read(viewer, "class-fee-lines", [sessionId, classId, f.installmentId, f.feeHeadId, f.section], (db) =>
      db.rpc<ClassFeeLines>("class_fee_lines", {
        p_session: sessionId,
        p_class: classId,
        p_installment: f.installmentId ?? undefined,
        p_fee_head: f.feeHeadId ?? undefined,
        p_section: f.section ?? undefined,
      }),
    ),
    /^Unknown/,
  );
}

export function classDetail(viewer: Viewer, sessionId: string, classId: string, arrears: boolean) {
  return orNotFound(
    read(viewer, "class-detail", [sessionId, classId, arrears], (db) =>
      db.rpc<ClassDetail>("class_detail", { p_session: sessionId, p_class: classId, p_include_arrears: arrears }),
    ),
    /^Unknown/,
  );
}

export function monthSummary(viewer: Viewer, month: string, carry: boolean, arrears: boolean) {
  return read(viewer, "month-summary", [month, carry, arrears], (db) =>
    db.rpc<MonthSummary>("month_summary", { p_month: monthDate(month), p_carry: carry, p_arrears: arrears }),
  );
}

/** Payments received in a month; `unassigned` = only students not enrolled in a class that month. */
export function monthPayments(viewer: Viewer, month: string, unassigned = false) {
  return read(viewer, "month-payments", [month, unassigned], (db) =>
    db.rpc<MonthPayment[] | null>("month_payments", { p_month: monthDate(month), p_unassigned: unassigned }).then((r) => r ?? []),
  );
}

export function monthNonPayers(viewer: Viewer, month: string, carry: boolean, arrears: boolean) {
  return read(viewer, "month-non-payers", [month, carry, arrears], (db) =>
    db.rpc<NonPayer[] | null>("month_non_payers", { p_month: monthDate(month), p_carry: carry, p_arrears: arrears }).then((r) => r ?? []),
  );
}

export async function monthClassDetail(viewer: Viewer, month: string, classId: string, carry: boolean, arrears: boolean) {
  const d = await read(viewer, "month-class", [month, classId, carry, arrears], (db) =>
    db.rpc<MonthClassDetail>("month_class_detail", { p_month: monthDate(month), p_class: classId, p_carry: carry, p_arrears: arrears }),
  );
  if (!d?.class?.id) throw notFound("That class does not exist.");
  return d;
}

export function installmentsOverview(viewer: Viewer, sessionId: string) {
  return read(viewer, "installments-overview", [sessionId], (db) =>
    db.rpc<InstallmentRow[] | null>("installments_overview", { p_session: sessionId }).then((r) => r ?? []),
  );
}

/** One installment of a session, by its number, with the session's other installments for navigation. */
export async function installmentDetail(viewer: Viewer, sessionId: string, number: number) {
  return read(viewer, "installment-detail", [sessionId, number], async (db) => {
    const siblings = await db.query<{ id: string; number: number; name: string }>(
      "select id, number, name from public.installments where session_id = $1 order by number",
      [sessionId],
    );
    const inst = siblings.find((i) => i.number === number);
    if (!inst) throw notFound("That installment does not exist in this session.");
    const detail = await db.rpc<InstallmentDetail>("installment_detail", { p_installment: inst.id });
    return { detail, siblings: siblings.map(({ number, name }) => ({ number, name })) };
  });
}

async function progressOf(db: Db, targetId: string) {
  return db.rpc<TargetProgress>("target_progress", { p_target: targetId });
}

/** Collection targets of a session with their progress. */
export function targets(viewer: Viewer, sessionId: string) {
  return read(viewer, "targets", [sessionId], async (db) => {
    const list = await db.query<CollectionTarget>(
      "select id, session_id, name, target_pct, target_date from public.collection_targets where session_id = $1 order by target_date",
      [sessionId],
    );
    const progress: TargetProgress[] = [];
    for (const t of list) progress.push(await progressOf(db, t.id));
    return progress;
  });
}

export function targetProgress(viewer: Viewer, targetId: string) {
  return orNotFound(
    read(viewer, "target", [targetId], (db) => progressOf(db, targetId)),
    /^Unknown target/,
    "That target does not exist.",
  );
}

export function reconciliation(viewer: Viewer, sessionId: string) {
  return orNotFound(
    read(viewer, "reconciliation", [sessionId], (db) => db.rpc<Reconciliation>("reconciliation", { p_session: sessionId })),
    /^Unknown session/,
    "That session does not exist.",
  );
}
