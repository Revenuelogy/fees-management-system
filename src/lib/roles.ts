// Role rules shared by the API (enforcement) and the UI (what to show). The database re-checks every one.
import type { AppRole } from "@/lib/types";

/** Roles that see school-wide figures (Home, months, classes, reports). */
export const STAFF_ROLES: AppRole[] = ["admin", "accountant", "principal"];
export const WRITER_ROLES: AppRole[] = ["admin", "accountant"];
/** Roles that call families: the staff above and callers. */
export const CALL_ROLES: AppRole[] = [...STAFF_ROLES, "caller"];

/** Staff who see school-wide fee data (everybody with a role but callers and teachers). */
export function isStaff(role: AppRole | null | undefined): role is AppRole {
  return !!role && STAFF_ROLES.includes(role);
}

/** May open the calling screens: the daily call list, a family's full profile, notes and activity responses. */
export function canCall(role: AppRole | null | undefined): role is AppRole {
  return !!role && CALL_ROLES.includes(role);
}

/** A caller only phones families: no school totals, no money changes. */
export function isCaller(role: AppRole | null | undefined) {
  return role === "caller";
}

/** Admin or accountant (may collect fees and change fee data). */
export function canWrite(role: AppRole | null | undefined) {
  return !!role && WRITER_ROLES.includes(role);
}

export function isAdmin(role: AppRole | null | undefined) {
  return role === "admin";
}

/** How a role is named on screen. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  accountant: "Accountant",
  principal: "Principal",
  caller: "Caller",
  teacher: "Class teacher",
};
