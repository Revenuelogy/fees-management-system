import "server-only";
import type { Viewer } from "@/server/auth/session";
import { read } from "@/server/data";
import { orNotFound } from "@/server/services/analytics";
import type { HomeChase, HomeClass, HomeFees, HomeToday } from "@/lib/types";

// The Home screen: one read per card (the home_* SQL functions in db/migrations/*_home.sql), so each card
// loads and fails on its own.

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

export function chase(viewer: Viewer) {
  return read(viewer, "home-chase", [], (db) => db.rpc<HomeChase>("home_chase"));
}

export function classes(viewer: Viewer, sessionId: string) {
  return orNotFound(
    read(viewer, "home-classes", [sessionId], (db) => db.rpc<HomeClass[]>("home_classes", { p_session: sessionId })),
    /^Unknown session/,
    "That session does not exist.",
  );
}
