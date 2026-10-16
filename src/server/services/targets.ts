import "server-only";
import type { Viewer } from "@/server/auth/session";
import { write } from "@/server/data";
import { notFound } from "@/server/http";

export async function createTarget(viewer: Viewer, input: { session_id: string; name: string | null; target_pct: number; target_date: string }) {
  const name = input.name ?? `${input.target_pct}% of fees due by ${input.target_date}`;
  return write(viewer, (db) =>
    db.one<{ id: string }>(
      "insert into public.collection_targets (session_id, name, target_pct, target_date) values ($1, $2, $3, $4) returning id",
      [input.session_id, name, input.target_pct, input.target_date],
    ),
  );
}

export async function deleteTarget(viewer: Viewer, id: string) {
  const row = await write(viewer, (db) => db.one("delete from public.collection_targets where id = $1 returning id", [id]));
  if (!row) throw notFound("That target no longer exists.");
}
