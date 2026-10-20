import "server-only";
import type { Viewer } from "@/server/auth/session";
import { cached, cacheKey, invalidate, TAGS } from "@/server/cache";
import { withUser, type Db } from "@/server/db";

/**
 * A cached read as the viewer. The key includes the role because, when the app connects as a
 * least-privilege role, row level security may return different rows to different roles.
 */
export function read<T>(viewer: Viewer, name: string, args: unknown[], load: (db: Db) => Promise<T>, tags: string[] = [TAGS.data]) {
  return cached(cacheKey(name, viewer.role, ...args), tags, () => withUser(viewer.id, load));
}

/** A write as the viewer (one transaction); afterwards every cached read with these tags is dropped. */
export async function write<T>(viewer: Viewer, run: (db: Db) => Promise<T>, tags: string[] = [TAGS.data]): Promise<T> {
  const out = await withUser(viewer.id, run);
  invalidate(...tags);
  return out;
}

/** Record an audit row (the audit() SQL function stamps the user and time). */
export function audit(db: Db, action: string, entity: string, entityId: string | null, details: unknown = null) {
  return db.rpc("audit", { p_action: action, p_entity: entity, p_entity_id: entityId, p_details: details ?? undefined });
}
