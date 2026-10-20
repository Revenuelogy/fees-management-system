import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cached, cacheKey, forget, TAGS } from "@/server/cache";
import { withUser } from "@/server/db";
import type { Viewer } from "@/lib/types";
import { hashPassword, verifyPassword } from "./password.mjs";

/** httpOnly cookie holding the random session token. */
export const AUTH_COOKIE = "fms_auth";
/** A session ends after this many days without use… */
const IDLE_DAYS = 7;
/** …and always this many days after signing in. */
export const MAX_DAYS = 30;

export type { Viewer };

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

// Verifying against a throwaway hash when the email is unknown keeps both paths equally slow.
let dummyHash: Promise<string> | undefined;

/** Check the password and open a new session. Returns the cookie token, or null for wrong credentials. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const user = await withUser(null, (db) =>
    db.one<{ id: string; password_hash: string }>("select id, password_hash from public.app_users where lower(email) = lower($1)", [email]),
  );
  const ok = await verifyPassword(password, user?.password_hash ?? (await (dummyHash ??= hashPassword(randomBytes(12).toString("hex")))));
  if (!user || !ok) return null;

  const token = randomBytes(32).toString("base64url");
  await withUser(user.id, async (db) => {
    await db.query("delete from public.app_sessions where expires_at <= now() or created_at <= now() - make_interval(days => $1)", [MAX_DAYS]);
    await db.query("insert into public.app_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + make_interval(days => $3))", [
      hashToken(token),
      user.id,
      IDLE_DAYS,
    ]);
    await db.query("update public.app_users set last_sign_in_at = now() where id = $1", [user.id]);
  });
  return token;
}

/** The signed-in staff member for a session token (cached briefly), or null. */
export async function viewerForToken(token: string | undefined): Promise<Viewer | null> {
  if (!token || token.length > 128) return null;
  const hash = hashToken(token);
  return cached(cacheKey("viewer", hash), [TAGS.staff], () =>
    withUser(null, (db) =>
      db.one<Viewer>("select * from public.session_viewer($1, $2, $3)", [hash, IDLE_DAYS, MAX_DAYS]),
    ),
  );
}

export async function signOut(token: string | undefined) {
  if (!token) return;
  const hash = hashToken(token);
  await withUser(null, (db) => db.query("delete from public.app_sessions where token_hash = $1", [hash]));
  forget(cacheKey("viewer", hash));
}
