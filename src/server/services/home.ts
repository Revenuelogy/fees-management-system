import "server-only";
import type { Viewer } from "@/server/auth/session";
import { read } from "@/server/data";
import { orNotFound } from "@/server/services/analytics";
import type { HomeClass, HomeFees, HomeToday } from "@/lib/types";

// The Home screen: one read per card (the home_* SQL functions in db/migrations/*_home.sql and
// *_dashboards_and_assignments.sql; the period card reads recovery.summary()), so each card loads and fails on its own.

export function fees(viewer: Viewer, sessionId: string) {
  return orNotFound(
    read(viewer, "home-fees", [sessionId], (db) => db.rpc<HomeFees>("home_fees", { p_session: sessionId })),
    /^Unknown session/,
    "That session does not exist.",
  );
}

export function today(viewer: Viewer) {
  return read(viewer, "home-today", [], (db) => db.rpc<HomeToday>("home_today"));
}

export function classes(viewer: Viewer, sessionId: string) {
  return orNotFound(
    read(viewer, "home-classes", [sessionId], (db) => db.rpc<HomeClass[]>("home_classes", { p_session: sessionId })),
    /^Unknown session/,
    "That session does not exist.",
  );
}
