import "server-only";
import { z } from "zod";

// Building blocks for request schemas. Request bodies carry money as integer paise and dates as ISO strings.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const id = (message = "Unknown record.") => z.string({ error: message }).regex(UUID_RE, message);

function realDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export const isoDate = (message = "Enter a valid date.") => z.string({ error: message }).refine(realDate, message);

/** YYYY-MM */
export const month = () => z.string({ error: "Unknown month." }).regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Unknown month.");

/** Integer paise. */
export const paise = (message = "Enter a valid amount.") => z.number({ error: message }).int(message).safe(message);

/** Trimmed text; empty becomes null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .max(max, `Keep it under ${max} characters.`)
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()));

export const requiredText = (message: string, max = 200) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Keep it under ${max} characters.`);

/** Query-string boolean ("1"/"0"/"true"/"false"), with a default. */
export const flag = (fallback: boolean) =>
  z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "1" || v === "true"));

/** Query-string integer within bounds, with a default. */
export const intParam = (fallback: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return v === undefined || v === "" || !Number.isFinite(n) ? fallback : Math.min(Math.max(Math.trunc(n), min), max);
    });

/** Optional ISO date; empty becomes null. */
export const optionalDate = (message = "Enter a valid date.") =>
  z
    .string({ error: message })
    .nullish()
    .transform((v) => (v == null || v.trim() === "" ? null : v.trim()))
    .refine((v) => v === null || realDate(v), message);

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
