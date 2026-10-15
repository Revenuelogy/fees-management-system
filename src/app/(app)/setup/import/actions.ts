"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { friendlyError, type ActionState } from "@/lib/action-state";
import { parseRupees, todayIST } from "@/lib/format";
import { parseFlexibleDate } from "../_lib/dates";
import { IMPORT_SPECS, emptySummary, type ImportKind, type ImportSummary } from "./columns";

const MAX_ROWS = 1000;

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

/**
 * Imports one chunk (at most 1000 rows) of a parsed CSV. `offset` is the index of the chunk's first row in
 * the file, so error line numbers match the spreadsheet (line 1 = header).
 */
export async function importChunk(input: {
  kind: ImportKind;
  rows: Record<string, string>[];
  offset: number;
  final: boolean;
  sessionId?: string | null;
  generate?: boolean;
}): Promise<ActionState> {
  await requireWriter();
  const spec = IMPORT_SPECS[input.kind];
  if (!spec) return { error: "Unknown import type." };
  if (!Array.isArray(input.rows) || input.rows.length > MAX_ROWS) return { error: `Send at most ${MAX_ROWS} rows at a time.` };

  const keys = spec.columns.map((c) => c.key);
  const offset = Math.max(0, Number(input.offset) || 0);
  const lineOf = (i: number) => offset + i + 2;
  const today = todayIST();
  const summary: ImportSummary = emptySummary();
  const send: Record<string, string | number>[] = [];
  const sentIdx: number[] = [];
  const clean = input.rows.map((raw) => {
    const r: Record<string, string> = {};
    for (const k of keys) r[k] = String((raw as Record<string, unknown>)?.[k] ?? "").trim();
    return r;
  });
  clean.forEach((r, i) => {
    const m = mapRow(input.kind, r, today);
    if ("error" in m) summary.errors.push({ line: lineOf(i), admission_no: r.admission_no, message: m.error });
    else {
      send.push(m.row);
      sentIdx.push(i);
    }
  });
  summary.sent = send.length;

  const supabase = await createClient();
  let result: RpcResult | null = null;
  let error: { message?: string; code?: string } | null = null;

  if (input.kind === "students") {
    const sessionId = input.sessionId || null;
    const generate = !!input.generate && input.final && !!sessionId;
    if (send.length) {
      const res = await supabase.rpc("import_students", { p_session: sessionId, p_rows: send, p_generate: generate });
      result = res.data as RpcResult | null;
      error = res.error;
    } else if (generate) {
      const res = await supabase.rpc("generate_charges", { p_session: sessionId, p_class: null, p_student: null, p_overwrite: false });
      error = res.error;
    }
    summary.generated = generate && !error;
  } else if (send.length) {
    const res = await supabase.rpc(input.kind === "dues" ? "import_opening_dues" : "import_payments", { p_rows: send });
    result = res.data as RpcResult | null;
    error = res.error;
  }

  if (error) {
    summary.sent = 0;
    return { error: friendlyError(error), data: summary };
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

  if (send.length || summary.generated) revalidatePath("/", "layout");
  return { ok: true, data: summary };
}
