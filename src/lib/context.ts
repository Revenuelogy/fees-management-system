import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { AcademicSession, SchoolClass, SchoolSettings } from "@/lib/types";

export const SESSION_COOKIE = "fms_session";

export const getSessions = cache(async (): Promise<AcademicSession[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("academic_sessions").select("*").order("start_date", { ascending: false });
  return (data as AcademicSession[]) ?? [];
});

/** The session the user is looking at: cookie choice, else the current session, else the latest. */
export const getActiveSession = cache(async (): Promise<AcademicSession | null> => {
  const sessions = await getSessions();
  if (sessions.length === 0) return null;
  const store = await cookies();
  const chosen = store.get(SESSION_COOKIE)?.value;
  return (
    sessions.find((s) => s.id === chosen) ??
    sessions.find((s) => s.is_current) ??
    sessions[0]
  );
});

export const getClasses = cache(async (): Promise<SchoolClass[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("classes").select("*").order("sort_order").order("name");
  return (data as SchoolClass[]) ?? [];
});

export const getSettings = cache(async (): Promise<SchoolSettings | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("school_settings").select("*").eq("id", 1).maybeSingle();
  return (data as SchoolSettings | null) ?? null;
});

/** Read a boolean flag from search params ("1"/"0"), with a default. */
export function flag(value: string | string[] | undefined, fallback: boolean): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
