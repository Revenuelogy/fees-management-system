// Form handlers for staff logins and roles (API: /api/staff). Admin only.

import { api, submit } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["admin", "accountant", "principal", "caller", "teacher"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result = { message: string };
const withMessage = (r: Result): ActionState => ({ ok: true, message: r.message });

function text(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** "" = no access (null). Returns undefined when the value is not a known role. */
function readRole(formData: FormData): AppRole | null | undefined {
  const raw = text(formData, "role");
  if (raw === null || raw === "none") return null;
  return ROLES.includes(raw as AppRole) ? (raw as AppRole) : undefined;
}

export async function setRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  const role = readRole(formData);
  if (!id || !UUID_RE.test(id)) return { error: "Unknown staff member." };
  if (role === undefined) return { error: "Choose a role." };
  return submit(() => api.patch<Result>(`/api/staff/${id}`, { role }), withMessage);
}

export async function createStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const fullName = text(formData, "full_name");
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  const role = readRole(formData);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!fullName) return { error: "Enter the staff member's name." };
  if (password.length < 8) return { error: "The temporary password must be at least 8 characters." };
  if (role === undefined) return { error: "Choose a role." };
  return submit(() => api.post<Result>("/api/staff", { email, full_name: fullName, password, role }), withMessage);
}

export async function resetPassword(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = text(formData, "id");
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  if (!id || !UUID_RE.test(id)) return { error: "Unknown staff member." };
  if (password.length < 8) return { error: "The new password must be at least 8 characters." };
  return submit(() => api.post<Result>(`/api/staff/${id}/password`, { password }), withMessage);
}
