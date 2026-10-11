import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole, Profile } from "@/lib/types";

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return { user: data.user, profile: (profile as Profile | null) ?? null };
});

const STAFF: AppRole[] = ["admin", "accountant", "principal"];
const WRITERS: AppRole[] = ["admin", "accountant"];

export function canWrite(role: AppRole | null | undefined) {
  return !!role && WRITERS.includes(role);
}

export function isAdmin(role: AppRole | null | undefined) {
  return role === "admin";
}

/** Any staff member who can read fee data. Redirects otherwise. */
export async function requireStaff() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile?.role || !STAFF.includes(viewer.profile.role)) redirect("/no-access");
  return { ...viewer, role: viewer.profile.role as AppRole };
}

/** Admin or accountant (may collect fees and change fee data). */
export async function requireWriter() {
  const viewer = await requireStaff();
  if (!canWrite(viewer.role)) redirect("/");
  return viewer;
}

export async function requireAdmin() {
  const viewer = await requireStaff();
  if (!isAdmin(viewer.role)) redirect("/");
  return viewer;
}
