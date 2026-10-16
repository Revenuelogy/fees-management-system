import "server-only";
import type { Viewer } from "@/server/auth/session";
import { read } from "@/server/data";
import { notFound } from "@/server/http";
import type { AcademicSession, FeeHead, Installment, SchoolClass, SchoolSettings } from "@/lib/types";

// Reference data most screens need. Small, cached, and dropped on any data write.

export function sessions(viewer: Viewer) {
  return read(viewer, "sessions", [], (db) =>
    db.query<AcademicSession>("select id, name, start_date, end_date, is_current from public.academic_sessions order by start_date desc"),
  );
}

export function classes(viewer: Viewer) {
  return read(viewer, "classes", [], (db) =>
    db.query<SchoolClass>("select id, name, sort_order, is_active from public.classes order by sort_order, name"),
  );
}

export function feeHeads(viewer: Viewer) {
  return read(viewer, "fee-heads", [], (db) =>
    db.query<FeeHead>("select id, name, priority, is_active from public.fee_heads order by priority, name"),
  );
}

export function installments(viewer: Viewer, sessionId: string) {
  return read(viewer, "installments", [sessionId], (db) =>
    db.query<Installment>(
      "select id, session_id, number, name, due_date from public.installments where session_id = $1 order by number",
      [sessionId],
    ),
  );
}

export async function settings(viewer: Viewer) {
  const row = await read(viewer, "settings", [], (db) => db.one<SchoolSettings>("select * from public.school_settings where id = 1"));
  if (!row) throw notFound("School settings row is missing (school_settings id = 1).");
  return row;
}

export async function session(viewer: Viewer, id: string) {
  const s = (await sessions(viewer)).find((x) => x.id === id);
  if (!s) throw notFound("That session does not exist.");
  return s;
}

/** Everything the app shell needs in one round trip. */
export async function bootstrap(viewer: Viewer) {
  const [s, c, st] = await Promise.all([sessions(viewer), classes(viewer), settings(viewer)]);
  return { viewer, sessions: s, classes: c, settings: st };
}
