"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import type { AppRole } from "@/lib/types";

const ROLES: AppRole[] = ["admin", "accountant", "principal", "teacher"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const viewer = await requireAdmin();
  const id = text(formData, "id");
  const role = readRole(formData);
  if (!id || !UUID_RE.test(id)) return { error: "Unknown staff member." };
  if (role === undefined) return { error: "Choose a role." };
  if (id === viewer.user.id && role !== "admin") {
    return { error: "You cannot remove your own admin role. Ask another admin to do it." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("role, email").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("profiles").update({ role }).eq("id", id).select("id");
  if (error) return { error: friendlyError(error) };
  if (!data || data.length === 0) return { error: "This staff member no longer exists." };
  await supabase.rpc("audit", {
    p_action: "set_role",
    p_entity: "profiles",
    p_entity_id: id,
    p_details: { email: (before as { email: string | null } | null)?.email ?? null, from: (before as { role: string | null } | null)?.role ?? null, to: role },
  });
  revalidatePath("/settings/staff");
  return { ok: true, message: "Role saved." };
}

export async function createStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = text(formData, "email")?.toLowerCase() ?? null;
  const fullName = text(formData, "full_name");
  const password = typeof formData.get("password") === "string" ? String(formData.get("password")) : "";
  const role = readRole(formData);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!fullName) return { error: "Enter the staff member's name." };
  if (password.length < 8) return { error: "The temporary password must be at least 8 characters." };
  if (role === undefined) return { error: "Choose a role." };

  const admin = createAdminClient();
  if (!admin) return { error: "SUPABASE_SECRET_KEY is not configured on the server, so logins cannot be created here." };

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const msg = createError?.message ?? "";
    if (/already (been )?registered|already exists/i.test(msg)) {
      return { error: "A login with this email already exists. Find it in the list and change its role there." };
    }
    return { error: msg || "Could not create the login." };
  }
  const userId = created.user.id;

  // A database trigger creates the profile (role empty); set the name and role on it.
  const supabase = await createClient();
  const { data: updated, error: roleError } = await supabase
    .from("profiles")
    .update({ role, full_name: fullName })
    .eq("id", userId)
    .select("id");
  if (roleError) return { error: `Login created, but the role could not be set: ${friendlyError(roleError)}` };
  if (!updated || updated.length === 0) {
    const { error: insertError } = await admin.from("profiles").insert({ id: userId, email, full_name: fullName, role });
    if (insertError) return { error: `Login created, but its profile could not be saved: ${friendlyError(insertError)}` };
  }
  await supabase.rpc("audit", { p_action: "create_staff", p_entity: "profiles", p_entity_id: userId, p_details: { email, role } });
  revalidatePath("/settings/staff");
  return { ok: true, message: `Login created for ${email}. Share the temporary password with them privately.` };
}
