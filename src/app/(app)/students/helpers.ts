// Small helpers shared by the student pages (register, form, fee plan). Not a route.
import type { Student } from "@/lib/types";

export const STUDENT_STATUS_LABELS: Record<Student["status"], string> = {
  active: "Active",
  left: "Left",
  passed_out: "Passed out",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Paise -> a plain rupee string for an <input> ("12500", "12500.50"). */
export function toRupeeInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** Trimmed string from FormData, or null when empty. */
export function text(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export function isIsoDate(value: string | null): boolean {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Sort roll numbers naturally ("2" before "10"); empty last. */
export function compareRoll(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "en-IN", { numeric: true, sensitivity: "base" });
}
