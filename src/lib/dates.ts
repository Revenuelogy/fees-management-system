// Pure date helpers (safe on server and client). Dates are ISO strings (YYYY-MM-DD).

const pad = (n: number) => String(n).padStart(2, "0");

function valid(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Accepts YYYY-MM-DD (or YYYY/MM/DD) and DD-MM-YYYY / DD/MM/YYYY / DD.MM.YYYY.
 * Returns ISO YYYY-MM-DD, or null when blank or not a real date.
 */
export function parseFlexibleDate(input: string | null | undefined): string | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return valid(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Strict ISO check used for <input type="date"> values. */
export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && parseFlexibleDate(s) === s;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Same day/month, `delta` years later (29 Feb falls back to 28 Feb). */
export function shiftYears(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return valid(y + delta, m, d) ?? valid(y + delta, m, d - 1) ?? iso;
}

export function isoFrom(y: number, m: number, d: number): string {
  // normalises month overflow (e.g. month 14 -> February next year)
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Same day `delta` months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonthsIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}
