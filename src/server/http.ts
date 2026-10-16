import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { friendlyError } from "@/lib/action-state";
import { canWrite, isAdmin, isStaff } from "@/lib/roles";
import { AUTH_COOKIE, viewerForToken, type Viewer } from "@/server/auth/session";
import { isDbError } from "@/server/db";

/** An error whose message is safe to show to the user. `extra` fields are added to the JSON body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (message = "Not found.") => new ApiError(404, message, "not_found");
export const badRequest = (message: string) => new ApiError(400, message);

/** API responses depend on the signed-in user and change often: never let a browser or CDN store them. */
const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return json({ ...e.extra, error: e.message, code: e.code }, { status: e.status });
  if (e instanceof z.ZodError) return json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  if (isDbError(e)) {
    const code = e.code ?? "";
    const status =
      code === "42501" ? 403
      : code === "23514" || code === "P0001" || code.startsWith("22") ? 400
      : code.startsWith("23") ? 409
      : 500;
    if (status === 500) console.error(e);
    return json({ error: status === 500 ? "The database could not complete this request." : friendlyError(e) }, { status });
  }
  console.error(e);
  return json({ error: "Something went wrong." }, { status: 500 });
}

type Access = "signed-in" | "staff" | "writer" | "admin";

const DENIED: Record<Exclude<Access, "signed-in">, string> = {
  staff: "Your account is waiting for access. An administrator needs to give it a role.",
  writer: "Only an admin or accountant can do this.",
  admin: "Only an admin can do this.",
};

function allowed(access: Access, viewer: Viewer) {
  if (access === "signed-in") return true;
  if (access === "staff") return isStaff(viewer.role);
  if (access === "writer") return canWrite(viewer.role);
  return isAdmin(viewer.role);
}

/**
 * Requests that change data must come from this site: browsers always send Origin on cross-site
 * requests, and a JSON body cannot be posted cross-site without a CORS preflight we never allow.
 */
function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD") return;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && originHost(origin) !== host) throw new ApiError(403, "Cross-site request refused.");
}

function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return null; // "null" origin (sandboxed frames, file:)
  }
}

export async function currentViewer(req: NextRequest): Promise<Viewer | null> {
  return viewerForToken(req.cookies.get(AUTH_COOKIE)?.value);
}

type Handler<P> = (ctx: { req: NextRequest; params: P; viewer: Viewer }) => Promise<unknown>;

/**
 * Wrap a route handler: checks the session and role, refuses cross-site writes, turns thrown errors into
 * JSON `{ error }` responses and returns the handler's result as JSON (or as-is when it is a Response).
 */
export function api<P = Record<string, never>>(access: Access, fn: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const viewer = await currentViewer(req);
      if (!viewer) {
        const res = json({ error: "Your session has ended. Sign in again.", code: "unauthenticated" }, { status: 401 });
        if (req.cookies.has(AUTH_COOKIE)) res.cookies.delete(AUTH_COOKIE);
        return res;
      }
      if (!allowed(access, viewer)) {
        throw new ApiError(403, DENIED[access as Exclude<Access, "signed-in">], access === "staff" ? "no_role" : "forbidden");
      }
      const result = await fn({ req, params: await ctx.params, viewer });
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Same as api() for routes anyone may call (sign in). */
export function publicApi<P = Record<string, never>>(fn: (ctx: { req: NextRequest; params: P }) => Promise<unknown>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      assertSameOrigin(req);
      const result = await fn({ req, params: await ctx.params });
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Parse and validate a JSON request body. */
export async function readBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  if (!req.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Send the request body as JSON.");
  let data: unknown;
  try {
    data = await req.json();
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
  return schema.parse(data);
}

/** Validate a path segment; a malformed one is a 404, like an unknown id. */
export function pathParam<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw notFound();
  return r.data;
}

/** Parse and validate the query string. */
export function readQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
