// Small helpers for reading page URLs (safe in server and client components).

/** Cookie remembering the academic session picked in the top bar. */
export const SESSION_COOKIE = "fms_session";

/** Read a boolean flag from search params ("1"/"0"), with a default. */
export function flag(value: string | string[] | undefined | null, fallback: boolean): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return fallback;
}

export function param(value: string | string[] | undefined | null): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ?? undefined;
}

/** A page's search params, as Next passes them to page components. */
export type SearchParams = Record<string, string | string[] | undefined>;
