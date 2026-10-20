import "server-only";
import type { Viewer } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password.mjs";
import { TAGS } from "@/server/cache";
import { audit, read, write } from "@/server/data";
import { isDbError } from "@/server/db";
import { ApiError, badRequest, notFound } from "@/server/http";
import { monthLabel } from "@/lib/format";
import type { AppRole, AuditRow, MonthSnapshot, SchoolSettings, StaffMember } from "@/lib/types";

// School settings, staff logins and the admin tools (re-run allocation, close / reopen months, audit log).

const BOTH = [TAGS.data, TAGS.staff];

// ---------------------------------------------------------------------------------------------
// School settings
// ---------------------------------------------------------------------------------------------

export type SchoolProfile = Pick<
  SchoolSettings,
  "school_name" | "address" | "phone" | "email" | "affiliation" | "receipt_prefix" | "receipt_footer" | "session_start_month"
>;

export async function updateSchoolProfile(viewer: Viewer, p: SchoolProfile) {
  await write(viewer, (db) =>
    db.query(
      `update public.school_settings
          set school_name = $1, address = $2, phone = $3, email = $4, affiliation = $5, receipt_prefix = $6,
              receipt_footer = $7, session_start_month = $8
        where id = 1`,
      [p.school_name, p.address, p.phone, p.email, p.affiliation, p.receipt_prefix, p.receipt_footer, p.session_start_month],
    ),
  );
  return { message: "School profile saved." };
}

export async function updateAllocationRule(viewer: Viewer, rule: SchoolSettings["allocation_order"]) {
  return write(viewer, async (db) => {
    const before = (await db.one<{ allocation_order: string }>("select allocation_order from public.school_settings where id = 1"))?.allocation_order;
    if (before === rule) return { message: "The rule is unchanged." };
    // A trigger on school_settings re-runs the allocation of every payment when this changes.
    await db.query("update public.school_settings set allocation_order = $1 where id = 1", [rule]);
    await audit(db, "change_allocation_rule", "school_settings", "1", { from: before ?? null, to: rule });
    return {
      message:
        rule === "oldest_first"
          ? "Saved. Every payment has been re-matched: previous-session dues are now cleared first."
          : "Saved. Every payment has been re-matched: current-session fees are now cleared first.",
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Staff logins and roles
// ---------------------------------------------------------------------------------------------

export function staff(viewer: Viewer) {
  return read(
    viewer,
    "staff",
    [],
    (db) =>
      db.query<StaffMember>(
        `select p.id, p.email, p.full_name, p.role, p.class_ids, p.created_at, u.last_sign_in_at
           from public.profiles p join public.app_users u on u.id = p.id
          order by p.created_at`,
      ),
    BOTH,
  );
}

export async function setRole(viewer: Viewer, id: string, role: AppRole | null) {
  if (id === viewer.id && role !== "admin") throw badRequest("You cannot remove your own admin role. Ask another admin to do it.");
  await write(
    viewer,
    async (db) => {
      const before = await db.one<{ role: string | null; email: string | null }>("select role, email from public.profiles where id = $1", [id]);
      if (!before) throw notFound("This staff member no longer exists.");
      await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
      await audit(db, "set_role", "profiles", id, { email: before.email, from: before.role, to: role });
    },
    BOTH,
  );
  return { message: "Role saved." };
}

export async function createStaff(viewer: Viewer, input: { email: string; full_name: string; password: string; role: AppRole | null }) {
  const hash = await hashPassword(input.password);
  try {
    await write(
      viewer,
      async (db) => {
        const user = await db.one<{ id: string }>("insert into public.app_users (email, password_hash) values ($1, $2) returning id", [input.email, hash]);
        // the on_app_user_created trigger made the profile (with no role); set the name and role on it
        await db.query("update public.profiles set full_name = $2, role = $3 where id = $1", [user!.id, input.full_name, input.role]);
        await audit(db, "create_staff", "profiles", user!.id, { email: input.email, role: input.role });
      },
      BOTH,
    );
  } catch (e) {
    if (isDbError(e) && e.code === "23505") {
      throw new ApiError(409, "A login with this email already exists. Find it in the list and change its role there.");
    }
    throw e;
  }
  return { message: `Login created for ${input.email}. Share the temporary password with them privately.` };
}

/** Set a new password for a staff login and sign it out everywhere. */
export async function resetPassword(viewer: Viewer, id: string, password: string) {
  const hash = await hashPassword(password);
  await write(
    viewer,
    async (db) => {
      const user = await db.one<{ email: string }>("update public.app_users set password_hash = $2 where id = $1 returning email", [id, hash]);
      if (!user) throw notFound("This staff member no longer exists.");
      await db.query("delete from public.app_sessions where user_id = $1", [id]);
      await audit(db, "reset_password", "profiles", id, { email: user.email });
    },
    BOTH,
  );
  return {
    message:
      id === viewer.id
        ? "Password changed. Sign in again with the new password."
        : "Password changed and the staff member was signed out everywhere. Share the new password with them privately.",
  };
}

// ---------------------------------------------------------------------------------------------
// Admin tools
// ---------------------------------------------------------------------------------------------

export async function rerunAllocation(viewer: Viewer) {
  const n = Number(await write(viewer, (db) => db.rpc<number>("rerun_allocation")));
  return { message: `Allocation re-run for ${n} ${n === 1 ? "student" : "students"} with payments.` };
}

export async function closeMonth(viewer: Viewer, month: string) {
  await write(viewer, (db) => db.rpc("close_month", { p_month: `${month}-01` }));
  return { message: `${monthLabel(month)} closed. Its numbers are frozen.` };
}

export async function reopenMonth(viewer: Viewer, month: string) {
  await write(viewer, (db) => db.rpc("reopen_month", { p_month: `${month}-01` }));
  return { message: `${monthLabel(month)} reopened. It shows live numbers again.` };
}

/** Closed (frozen) months between two months (YYYY-MM, inclusive). */
export function snapshots(viewer: Viewer, from: string, to: string) {
  return read(viewer, "snapshots", [from, to], (db) =>
    db.query<MonthSnapshot>(
      `select to_char(m.month, 'YYYY-MM') as month, m.closed_at,
              coalesce(nullif(p.full_name, ''), p.email) as closed_by_name
         from public.monthly_snapshots m left join public.profiles p on p.id = m.closed_by
        where m.month between $1::date and $2::date
        order by m.month`,
      [`${from}-01`, `${to}-01`],
    ),
  );
}

/** The latest audit entries with who made them. */
export function auditLog(viewer: Viewer, limit: number) {
  return read(
    viewer,
    "audit",
    [limit],
    (db) =>
      db.query<AuditRow>(
        `select a.id, a.at, a.user_id, coalesce(nullif(p.full_name, ''), p.email) as user_name, a.action, a.entity, a.entity_id, a.details
           from public.audit_log a left join public.profiles p on p.id = a.user_id
          order by a.at desc, a.id desc
          limit $1`,
        [limit],
      ),
    BOTH,
  );
}
