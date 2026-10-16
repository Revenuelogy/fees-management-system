// Role rules shared by the API (enforcement) and the UI (what to show). The database re-checks every one.
import type { AppRole } from "@/lib/types";

export const STAFF_ROLES: AppRole[] = ["admin", "accountant", "principal"];
export const WRITER_ROLES: AppRole[] = ["admin", "accountant"];

/** Any staff member who can read fee data. */
export function isStaff(role: AppRole | null | undefined): role is AppRole {
  return !!role && STAFF_ROLES.includes(role);
}

/** Admin or accountant (may collect fees and change fee data). */
export function canWrite(role: AppRole | null | undefined) {
  return !!role && WRITER_ROLES.includes(role);
}

export function isAdmin(role: AppRole | null | undefined) {
  return role === "admin";
}
