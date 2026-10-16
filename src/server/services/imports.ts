import "server-only";
import type { Viewer } from "@/server/auth/session";
import { write } from "@/server/data";
import { isDbError } from "@/server/db";
import { ApiError } from "@/server/http";
import { friendlyError } from "@/lib/action-state";
import { parseFlexibleDate } from "@/lib/dates";
import { parseRupees, todayIST } from "@/lib/format";
import { IMPORT_SPECS, emptySummary, type ImportKind, type ImportSummary } from "@/lib/import-columns";

// CSV imports: rows arrive as the spreadsheet's text cells; they are checked and normalised here, then the
// import_* SQL functions insert them (reporting row-level problems instead of failing the whole chunk).

export const MAX_ROWS = 1000;

type Mapped = { row: Record<string, string | number> } | { error: string };

const MODE_ALIASES: Record<string, string> = {
  cash: "cash",
  upi: "upi",
  gpay: "upi",
  "google pay": "upi",
  phonepe: "upi",
  "phone pe": "upi",
  paytm: "upi",
  bhim: "upi",
  cheque: "cheque",
  check: "cheque",
  chq: "cheque",
  "bank transfer": "bank_transfer",
  bank: "bank_transfer",
  neft: "bank_transfer",
  rtgs: "bank_transfer",
  imps: "bank_transfer",
  online: "bank_transfer",
  "net banking": "bank_transfer",
  netbanking: "bank_transfer",
  transfer: "bank_transfer",
  card: "card",
  "credit card": "card",
  "debit card": "card",
  pos: "card",
  swipe: "card",
  other: "other",
  dd: "other",
  "demand draft": "other",
};

function normMode(v: string): string | null {
  const k = v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!k) return "cash";
  return MODE_ALIASES[k] ?? null;
}

function normGender(v: string): string | null {
  const k = v.toLowerCase().trim();
  if (!k) return "";
  if (["m", "male", "boy", "b"].includes(k)) return "M";
  if (["f", "female", "girl", "g"].includes(k)) return "F";
  if (["o", "other", "others", "t", "transgender"].includes(k)) return "O";
  return null;
}

function dateField(r: Record<string, string>, key: string, required: boolean): { value: string } | { error: string } {
  const raw = r[key];
  if (!raw) return required ? { error: `${key} is required` } : { value: "" };
  const iso = parseFlexibleDate(raw);
  if (!iso) return { error: `${key} “${raw}” is not a valid date (use YYYY-MM-DD or DD-MM-YYYY)` };
  return { value: iso };
}

function amountField(r: Record<string, string>): { value: number } | { error: string } {
  const raw = r.amount;
  if (!raw) return { error: "amount is required" };
  const paise = parseRupees(raw);
  if (paise === null) return { error: `amount “${raw}” is not a rupee amount` };
  if (paise <= 0) return { error: "amount must be more than 0" };
  return { value: paise };
}

function mapRow(kind: ImportKind, r: Record<string, string>, today: string): Mapped {
  if (!r.admission_no) return { error: "admission_no is required" };
  if (kind === "students") {
    if (!r.full_name) return { error: "full_name is required" };
    const dob = dateField(r, "dob", false);
    if ("error" in dob) return dob;
    const adm = dateField(r, "admission_date", false);
    if ("error" in adm) return adm;
    const gender = normGender(r.gender);
    if (gender === null) return { error: `gender “${r.gender}” should be M, F or O` };
    return { row: { ...r, dob: dob.value, admission_date: adm.value, gender } };
  }
  if (kind === "dues") {
    if (!r.session) return { error: "session is required (e.g. 2025-26)" };
    const amt = amountField(r);
    if ("error" in amt) return amt;
    return { row: { ...r, amount: amt.value } };
  }
  // payments
  const paid = dateField(r, "paid_on", true);
  if ("error" in paid) return paid;
  if (paid.value > today) return { error: `paid_on ${paid.value} is in the future` };
  const amt = amountField(r);
  if ("error" in amt) return amt;
  const mode = normMode(r.mode);
  if (!mode) return { error: `mode “${r.mode}” is not one of cash, upi, cheque, bank_transfer, card, other` };
  if (r.installment && !/^\d+$/.test(r.installment)) return { error: `installment “${r.installment}” should be a number like 1, 2 or 3` };
  return { row: { ...r, paid_on: paid.value, amount: amt.value, mode } };
}

type RpcResult = {
  created?: number;
  updated?: number;
  enrolled?: number;
  inserted?: number;
  duplicates?: number;
  errors?: { row: number; message: string }[];
};

export type ImportChunk = {
  rows: Record<string, unknown>[];
  /** index of the chunk's first row in the file, so error line numbers match the spreadsheet (line 1 = header) */
  offset: number;
  /** last chunk: generate charges for imported students (when asked) */
  final: boolean;
  session_id: string | null;
  generate: boolean;
};

/**
 * Import one chunk (at most 1000 rows) of a parsed CSV. When the database refuses the chunk, the error
 * response still carries the `summary` (row problems found before sending).
 */
export async function importChunk(viewer: Viewer, kind: ImportKind, input: ImportChunk): Promise<ImportSummary> {
  const spec = IMPORT_SPECS[kind];
  const keys = spec.columns.map((c) => c.key);
  const lineOf = (i: number) => input.offset + i + 2;
  const today = todayIST();
  const summary: ImportSummary = emptySummary();
  const send: Record<string, string | number>[] = [];
  const sentIdx: number[] = [];
  const clean = input.rows.map((raw) => {
    const r: Record<string, string> = {};
    for (const k of keys) r[k] = String(raw?.[k] ?? "").trim();
    return r;
  });
  clean.forEach((r, i) => {
    const m = mapRow(kind, r, today);
    if ("error" in m) summary.errors.push({ line: lineOf(i), admission_no: r.admission_no, message: m.error });
    else {
      send.push(m.row);
      sentIdx.push(i);
    }
  });
  summary.sent = send.length;

  let result: RpcResult | null = null;
  try {
    if (kind === "students") {
      const generate = input.generate && input.final && !!input.session_id;
      if (send.length) {
        result = await write(viewer, (db) => db.rpc<RpcResult>("import_students", { p_session: input.session_id, p_rows: send, p_generate: generate }));
      } else if (generate) {
        await write(viewer, (db) => db.rpc("generate_charges", { p_session: input.session_id, p_class: null, p_student: null, p_overwrite: false }));
      }
      summary.generated = generate;
    } else if (send.length) {
      result = await write(viewer, (db) => db.rpc<RpcResult>(kind === "dues" ? "import_opening_dues" : "import_payments", { p_rows: send }));
    }
  } catch (e) {
    if (!isDbError(e)) throw e;
    summary.sent = 0;
    summary.generated = false;
    throw new ApiError(e.code === "42501" ? 403 : 400, friendlyError(e), undefined, { summary });
  }

  summary.created = result?.created ?? 0;
  summary.updated = result?.updated ?? 0;
  summary.enrolled = result?.enrolled ?? 0;
  summary.inserted = result?.inserted ?? 0;
  summary.duplicates = result?.duplicates ?? 0;
  for (const e of result?.errors ?? []) {
    const i = sentIdx[e.row - 1];
    summary.errors.push({ line: i === undefined ? 0 : lineOf(i), admission_no: i === undefined ? "" : clean[i].admission_no, message: e.message });
  }
  summary.errors.sort((a, b) => a.line - b.line);
  return summary;
}
