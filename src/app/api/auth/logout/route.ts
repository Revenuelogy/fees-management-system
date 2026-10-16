import { AUTH_COOKIE, signOut } from "@/server/auth/session";
import { json, publicApi } from "@/server/http";

export const POST = publicApi(async ({ req }) => {
  await signOut(req.cookies.get(AUTH_COOKIE)?.value);
  const res = json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
});
