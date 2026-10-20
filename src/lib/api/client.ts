// Browser-side access to the REST API in src/app/api. Every screen reads and writes data only through here.

import { mutate } from "swr";
import type { ActionState } from "@/lib/action-state";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    /** the full JSON error body (some endpoints add details next to `error`) */
    readonly body?: unknown,
  ) {
    super(message);
  }
}

const OFFLINE = "Could not reach the server. Check the connection and try again.";

// Leaving the signed-in app is always a full page load: it drops everything the browser cached for that login.
function leaveTo(path: string) {
  window.location.assign(path);
}

function toLogin() {
  const here = window.location.pathname + window.location.search;
  leaveTo(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
}

/** fetch() + JSON + `{ error }` → ApiError. A 401 sends the browser to the sign-in page. */
export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { credentials: "same-origin", ...init, headers: { Accept: "application/json", ...init.headers } });
  } catch {
    throw new ApiError(0, OFFLINE, "offline");
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    const error = new ApiError(res.status, body?.error ?? `The server answered ${res.status}.`, body?.code, body);
    if (res.status === 401 && typeof window !== "undefined" && window.location.pathname !== "/login") toLogin();
    if (error.code === "no_role" && typeof window !== "undefined" && window.location.pathname !== "/no-access") {
      leaveTo("/no-access");
    }
    throw error;
  }
  return body as T;
}

function send<T>(method: string, url: string, body?: unknown) {
  return apiFetch<T>(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const api = {
  get: <T>(url: string) => apiFetch<T>(url),
  post: <T = { ok: true }>(url: string, body?: unknown) => send<T>("POST", url, body ?? {}),
  put: <T = { ok: true }>(url: string, body?: unknown) => send<T>("PUT", url, body ?? {}),
  patch: <T = { ok: true }>(url: string, body?: unknown) => send<T>("PATCH", url, body ?? {}),
  delete: <T = { ok: true }>(url: string) => send<T>("DELETE", url),
};

/** End the session on the server and go to the sign-in page (a full load also clears the browser cache). */
export async function signOut() {
  await api.post("/api/auth/logout").catch(() => {});
  leaveTo("/login");
}

/**
 * Refetch every piece of data on screen (and mark the rest stale). Called after each successful write:
 * a payment or fee change moves numbers on almost every screen, and the API has already dropped its
 * own cache, so this returns fresh figures. `except`: skip URLs containing it (a record just deleted).
 */
export function refreshAll(except?: string) {
  return mutate((key) => !except || typeof key !== "string" || !key.includes(except));
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : OFFLINE;
}

/**
 * For form handlers: run an API write, refresh the screen's data on success and turn the outcome into
 * the ActionState the forms render (`{ ok, message }` or `{ error }`).
 */
export async function submit<T>(call: () => Promise<T>, onOk?: (result: T) => ActionState | void): Promise<ActionState> {
  try {
    const result = await call();
    await refreshAll();
    return onOk?.(result) ?? { ok: true };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

/** Build `path?a=1&b=x`, skipping empty values. */
export function apiUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}
