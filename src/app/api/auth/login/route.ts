import { z } from "zod";
import { AUTH_COOKIE, MAX_DAYS, signIn } from "@/server/auth/session";
import { clearFailures, recordFailure, retryAfter } from "@/server/auth/rate-limit";
import { ApiError, json, publicApi, readBody } from "@/server/http";

const Body = z.object({
  email: z.string().trim().toLowerCase().min(1, "Enter your email and password.").max(254),
  password: z.string().min(1, "Enter your email and password.").max(200),
});

export const POST = publicApi(async ({ req }) => {
  const { email, password } = await readBody(req, Body);
  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const keys = [`ip:${client}`, `email:${email}`];

  const wait = retryAfter(keys);
  if (wait > 0) throw new ApiError(429, `Too many attempts. Try again in ${Math.ceil(wait / 60)} minutes.`);

  const token = await signIn(email, password);
  if (!token) {
    recordFailure(keys);
    throw new ApiError(401, "Wrong email or password.");
  }
  clearFailures(keys);

  const res = json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: MAX_DAYS * 24 * 60 * 60,
  });
  return res;
});
