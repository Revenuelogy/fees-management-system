// Column definitions for the three CSV imports. Shared by the client (template, preview, validation)
// and the server action (mapping). Keep this module free of server-only or client-only imports.

export type ImportKind = "students" | "dues" | "payments";

export interface ColumnSpec {
  key: string;
  required?: boolean;
  hint: string;
}

export interface ImportSpec {
  kind: ImportKind;
  label: string;
  title: string;
  intro: string;
  columns: ColumnSpec[];
  example: Record<string, string>[];
}

export const IMPORT_KINDS: ImportKind[] = ["students", "dues", "payments"];

export const IMPORT_SPECS: Record<ImportKind, ImportSpec> = {
  students: {
    kind: "students",
    label: "Students",
    title: "Import students",
    intro:
      "Adds new students and updates existing ones (matched by admission number; blank cells never erase saved details). Rows with a class are enrolled in the chosen session.",
    columns: [
      { key: "admission_no", required: true, hint: "Unique admission number" },
      { key: "full_name", required: true, hint: "Student's full name" },
      { key: "father_name", hint: "" },
      { key: "mother_name", hint: "" },
      { key: "phone", hint: "Main contact number" },
      { key: "alt_phone", hint: "" },
      { key: "email", hint: "" },
      { key: "dob", hint: "Date of birth" },
      { key: "gender", hint: "M / F / O (or Male / Female / Other)" },
      { key: "address", hint: "" },
      { key: "admission_date", hint: "" },
      { key: "class", hint: "A class name as set up, e.g. Class 5" },
      { key: "section", hint: "Defaults to A" },
      { key: "roll_no", hint: "" },
    ],
    example: [
      {
        admission_no: "A1001",
        full_name: "Aarav Sharma",
        father_name: "Rajesh Sharma",
        mother_name: "Sunita Sharma",
        phone: "9876543210",
        alt_phone: "",
        email: "",
        dob: "14-06-2016",
        gender: "M",
        address: "12 Station Road, Jaipur",
        admission_date: "2022-04-01",
        class: "Class 5",
        section: "A",
        roll_no: "1",
      },
      {
        admission_no: "A1002",
        full_name: "Diya Verma",
        father_name: "Sanjay Verma",
        mother_name: "",
        phone: "9812345678",
        alt_phone: "",
        email: "",
        dob: "02/11/2017",
        gender: "F",
        address: "",
        admission_date: "",
        class: "Class 4",
        section: "B",
        roll_no: "",
      },
    ],
  },
  dues: {
    kind: "dues",
    label: "Opening dues",
    title: "Import opening dues",
    intro:
      "Unpaid amounts carried over from before you started using this app. Each row adds to the student's dues in that session (on its first installment), so importing the same file twice doubles the dues.",
    columns: [
      { key: "admission_no", required: true, hint: "Student must already exist" },
      { key: "session", required: true, hint: "Session name, e.g. 2025-26" },
      { key: "amount", required: true, hint: "Rupees, e.g. 12500 or 12,500.50" },
      { key: "fee_head", hint: "Defaults to “Previous Dues” (created if missing)" },
      { key: "class", hint: "Enrols the student in that session if not enrolled yet" },
      { key: "section", hint: "Used with class; defaults to A" },
      { key: "note", hint: "" },
    ],
    example: [
      { admission_no: "A1001", session: "2025-26", amount: "8500", fee_head: "", class: "Class 4", section: "A", note: "Carried from old register" },
      { admission_no: "A1002", session: "2025-26", amount: "2,750.50", fee_head: "Transport Fee", class: "", section: "", note: "" },
    ],
  },
  payments: {
    kind: "payments",
    label: "Payments",
    title: "Import payments",
    intro:
      "Past receipts from another system. The session is taken from the payment date. Rows whose receipt number already exists are skipped, so re-importing a file is safe when receipt numbers are filled in.",
    columns: [
      { key: "admission_no", required: true, hint: "Student must already exist" },
      { key: "paid_on", required: true, hint: "Payment date" },
      { key: "amount", required: true, hint: "Rupees, more than 0" },
      { key: "mode", hint: "cash, upi, cheque, bank_transfer, card or other (default cash)" },
      { key: "receipt_no", hint: "Optional; a new number is given when blank" },
      { key: "reference_no", hint: "Cheque / UPI / transaction number" },
      { key: "session", hint: "Optional hint: session the payment was for" },
      { key: "fee_head", hint: "Optional hint: fee head it was for" },
      { key: "installment", hint: "Optional hint: installment number" },
      { key: "remarks", hint: "" },
    ],
    example: [
      {
        admission_no: "A1001",
        paid_on: "12-04-2026",
        amount: "15000",
        mode: "cash",
        receipt_no: "OLD/0001",
        reference_no: "",
        session: "",
        fee_head: "",
        installment: "",
        remarks: "",
      },
      {
        admission_no: "A1002",
        paid_on: "2026-05-03",
        amount: "4500",
        mode: "upi",
        receipt_no: "OLD/0002",
        reference_no: "UPI 6123 4567",
        session: "2026-27",
        fee_head: "Tuition Fee",
        installment: "1",
        remarks: "Paid at bank",
      },
    ],
  },
};

const ALIASES: Record<string, string> = {
  admission_number: "admission_no",
  adm_no: "admission_no",
  admission: "admission_no",
  sr_no: "admission_no",
  name: "full_name",
  student_name: "full_name",
  student: "full_name",
  father: "father_name",
  fathers_name: "father_name",
  mother: "mother_name",
  mothers_name: "mother_name",
  mobile: "phone",
  mobile_no: "phone",
  phone_no: "phone",
  contact: "phone",
  alternate_phone: "alt_phone",
  date_of_birth: "dob",
  birth_date: "dob",
  sex: "gender",
  date_of_admission: "admission_date",
  class_name: "class",
  roll: "roll_no",
  roll_number: "roll_no",
  date: "paid_on",
  payment_date: "paid_on",
  paid_date: "paid_on",
  receipt: "receipt_no",
  receipt_number: "receipt_no",
  payment_mode: "mode",
  reference: "reference_no",
  ref_no: "reference_no",
  transaction_id: "reference_no",
  installment_no: "installment",
  installment_number: "installment",
  remark: "remarks",
  head: "fee_head",
  fee_head_name: "fee_head",
  session_name: "session",
};

/** "Admission No." -> "admission_no", "Father's Name" -> "father_name", with a few common aliases. */
export function normalizeHeader(h: string): string {
  const k = h
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ALIASES[k] ?? k;
}

export type ImportError = { line: number; admission_no: string; message: string };

export type ImportSummary = {
  created: number;
  updated: number;
  enrolled: number;
  inserted: number;
  duplicates: number;
  errors: ImportError[];
  /** Rows actually sent to the database (after local validation) */
  sent: number;
  /** Charges generated for the session afterwards (students import) */
  generated?: boolean;
};

export const emptySummary = (): ImportSummary => ({ created: 0, updated: 0, enrolled: 0, inserted: 0, duplicates: 0, errors: [], sent: 0 });
