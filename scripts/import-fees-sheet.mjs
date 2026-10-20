#!/usr/bin/env node
// =============================================================================
// Import the school's 2026-27 fees data into PostgreSQL from two CSV files.
//
//   Dues sheet (Fees_Data2026-27.csv): one row per student with yearly totals for the
//   previous-year balance, the current fees and transport ("vehicle"), each with deposit,
//   discount and due. Source of students, fees, discounts and pending dues. It wins: after
//   the import every student's fees, discounts, deposits and dues equal this sheet.
//
//   Transactions file (Fees_2026-27-Fees_transactions.csv): one row per receipt with amount,
//   date and what it paid for (p previous, a admission, v vehicle, c current). Source of the
//   receipts (exact amounts and dates).
//
// Model (as agreed with the school):
//   * 2026-27 has five payable items per student: Admission Fee and Transport Fee (one payment
//     each) and the school fee in three installments. 2025-26 holds only the balance brought
//     forward ("Previous Fees").
//   * "Current Fees" includes the admission fee for new students; it becomes the Admission Fee
//     line only when the sheet's amount is exactly the class fee + that class's admission fee.
//   * A receipt pays what its letters name, in the order previous dues -> admission ->
//     transport -> school fee (installments oldest first), never more than the dues sheet
//     shows deposited for that column.
//
// Reconciling the two files per student (the sheet's Total Deposit is what was received):
//   * transactions add up to the deposit: imported as they are;
//   * they add up to less: imported, plus one receipt for the rest of the sheet's deposit;
//   * they add up to more: the only set of them that adds up to the deposit is imported and
//     the others are left out; when no single set does, the sheet's deposit is used instead;
//   * no transactions: the sheet's deposit is imported.
// Receipts made from the sheet keep the dates of itemised notes ("4000 on 1-10-26"), otherwise
// the sheet's Date. Every such step, every unmatched or unreadable row and every oddity in the
// sheet is written to the discrepancies CSV for manual review.
//
// Dry run by default: writes the discrepancies CSV and prints a report. --apply loads the data
// in one transaction and verifies every student against the sheet (directly and through the
// app's own balance and reconciliation functions) before committing; it refuses when the
// database already holds fee data unless --replace is given, which deletes that data first (in
// the same transaction). --rollback does all of that and then rolls back, as a rehearsal.
//
//   node scripts/import-fees-sheet.mjs [--dues file.csv] [--transactions file.csv]
//        [--out discrepancies.csv] [--plan plan.json] [--apply [--replace] [--rollback]]
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Papa from "papaparse";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.resolve(ROOT, "..");

// ---------------------------------------------------------------------------
// School-specific settings
// ---------------------------------------------------------------------------
const CURRENT = { name: "2026-27", start_date: "2026-04-01", end_date: "2027-03-31" };
const PREVIOUS = { name: "2025-26", start_date: "2025-04-01", end_date: "2026-03-31" };
// Fee groups in the order a payment clears them
const GROUPS = ["prev", "admission", "transport", "school"];
const HEADS = {
  prev: { name: "Previous Dues", priority: 0 },
  admission: { name: "Admission Fee", priority: 5 },
  transport: { name: "Transport Fee", priority: 6 },
  school: { name: "School Fee", priority: 10 },
};
// Payable items of the current session (the app calls them installments; the number sets the payment order)
const SCHEDULE = [
  { number: 1, name: "Admission Fee", due_date: "2026-04-01", group: "admission" },
  { number: 2, name: "Transport Fee", due_date: "2026-07-31", group: "transport" },
  { number: 3, name: "Installment 1", due_date: "2026-07-31", group: "school" },
  { number: 4, name: "Installment 2", due_date: "2026-09-30", group: "school" },
  { number: 5, name: "Installment 3", due_date: "2026-12-31", group: "school" },
];
const SCHOOL_ITEMS = SCHEDULE.filter((x) => x.group === "school");
const itemFor = (group) => SCHEDULE.find((x) => x.group === group).number;
const PREVIOUS_ITEM = { number: 1, name: "Balance brought forward", due_date: "2026-03-31" };
const CLASSES = [
  ["PLAY", "Play"], ["LKG", "LKG"], ["UKG", "UKG"], ["I", "Class I"], ["II", "Class II"], ["III", "Class III"],
  ["IV", "Class IV"], ["V", "Class V"], ["VI", "Class VI"], ["VII", "Class VII"], ["VIII", "Class VIII"],
  ["IX", "Class IX"], ["X", "Class X"],
];
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
// Admission fee (rupees) included in the sheet's "Current Fees" of new students
const ADMISSION_FEE = { PLAY: 1000, LKG: 1000, UKG: 1000, I: 1000, II: 1000, III: 1000, IV: 1000, V: 1000,
  VI: 1500, VII: 1500, VIII: 1500, IX: 1500, X: 1500 };
// Dues-sheet deposit column each group is paid from
const POOL = { prev: "prev", admission: "current", transport: "vehicle", school: "current" };
const POOLS = ["prev", "current", "vehicle"];
const POOL_WORDS = { prev: "previous", current: "current", vehicle: "vehicle" };
// Transactions file "Remarks" letters
const TX_GROUPS = { p: "prev", a: "admission", v: "transport", c: "school" };
const TX_WORDS = { p: "previous", a: "admission", v: "vehicle", c: "current" };
const RECEIPT_PREFIX = "IMP2627/";
// Receipts need a date; one the files do not record goes on the first day of the session (and is listed for review)
const UNDATED = CURRENT.start_date;
const ADMISSION_PREFIX = "VPS";
// Dues-sheet rows whose name cell is wrong, with the evidence. Key: line|class|name|father as written.
const NAME_FIXES = {
  "283|IV|IV|PAWAN JAGDISH VARMA": {
    name: "Pallavi Varma",
    why: 'Name cell holds the class "IV". Sibling row VI Vidhi Varma (father Pawan Varma) lists "IV Pallavi Varma", and transactions row 135 "Pallavi Verma / Pawan Verma" paid 5,000 on 14/09/2026, the deposit and date of this row.',
  },
};

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------
const { values: opts } = parseArgs({
  options: {
    dues: { type: "string", default: path.join(DATA_DIR, "Fees_Data2026-27.csv") },
    transactions: { type: "string", default: path.join(DATA_DIR, "Fees_2026-27-Fees_transactions.csv") },
    out: { type: "string", default: path.join(DATA_DIR, "Fees_2026-27-Import_Discrepancies.csv") },
    plan: { type: "string" },
    apply: { type: "boolean", default: false },
    replace: { type: "boolean", default: false },
    rollback: { type: "boolean", default: false },
  },
});
const TODAY = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // Asia/Kolkata

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const paise = (r) => Math.round(r * 100);
const inr = (p) => "₹" + (p / 100).toLocaleString("en-IN");
const rupees = (p) => (p === null || p === undefined ? "" : p / 100);
const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const num = (s) => {
  const v = clean(s).replace(/,/g, "");
  if (v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const titleCase = (s) => clean(s).toLowerCase().replace(/(^|[\s.(-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);
const dmy = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const groupWords = (byGroup) => GROUPS.filter((g) => byGroup[g]).map((g) => `${HEADS[g].name} ${rupees(byGroup[g])}`).join(", ");

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}
const fullYear = (y) => (Number(y) < 100 ? 2000 + Number(y) : Number(y));

// "13/07/2026"
function sheetDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(clean(s));
  return m ? isoDate(+m[3], +m[2], +m[1]) : null;
}

// Itemised payments written in the sheet: "4000 on 1-10-26", "6000 on 17-8-26 online", "11-8-26 ko 5000"
function paymentsInText(s) {
  const out = [];
  for (const m of clean(s).matchAll(/(\d{3,6})\s+on\s+(\d{1,2})-(\d{1,2})-(\d{2,4})(\s+online)?/gi)) {
    out.push({ amount: paise(+m[1]), date: isoDate(fullYear(m[4]), +m[3], +m[2]), online: Boolean(m[5]), text: m[0] });
  }
  for (const m of clean(s).matchAll(/(\d{1,2})-(\d{1,2})-(\d{2,4})\s+ko\s+(\d{3,6})/gi)) {
    out.push({ amount: paise(+m[4]), date: isoDate(fullYear(m[3]), +m[2], +m[1]), online: false, text: m[0] });
  }
  return out;
}

// Payment mode written in the sheet (the app's own CSV import reads "online" as bank transfer)
function mapMode(s) {
  const v = clean(s).toLowerCase();
  if (v === "cash") return "cash";
  if (v === "online" || v === "onine") return "bank_transfer";
  return null;
}

// Split a paise amount into n whole-rupee lines as equal as possible (the last line takes the rest)
function splitEqual(totalPaise, n) {
  const r = totalPaise / 100;
  const base = Math.floor(r / n);
  return Array.from({ length: n }, (_, i) => paise(i < n - 1 ? base : r - base * (n - 1)));
}

// Concession taken from the last line backwards
function spreadConcession(amounts, concession) {
  const out = amounts.map(() => 0);
  let left = concession;
  for (let i = amounts.length - 1; i >= 0 && left > 0; i--) {
    out[i] = Math.min(amounts[i], left);
    left -= out[i];
  }
  if (left > 0) throw new Error("discount larger than the fee");
  return out;
}

// ---- fuzzy name matching (Indian spelling variants: Avni/Avani, Naveen/Navin, Khushbu/Khusbu) ----
const NOISE_WORDS = new Set(["kumar", "kumari", "singh", "devi", "ji"]);
const words = (s) => {
  const all = clean(s).toLowerCase().replace(/[^a-z ]/g, " ").split(" ").filter(Boolean);
  const kept = all.filter((w) => !NOISE_WORDS.has(w));
  return kept.length ? kept : all;
};
function phonetic(w) {
  let s = w.replace(/ee/g, "i").replace(/oo/g, "u").replace(/w/g, "v").replace(/z/g, "j").replace(/([bcdgkpst])h/g, "$1");
  s = s[0] + s.slice(1).replace(/y/g, "i").replace(/[ae]/g, "");
  return s.replace(/(.)\1+/g, "$1");
}
function editDistance(a, b) { // optimal string alignment (counts a swap as one edit)
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
const ratio = (a, b) => (!a || !b ? 0 : 1 - editDistance(a, b) / Math.max(a.length, b.length));
function wordSim(a, b) {
  if (!a || !b) return 0;
  const prefix = Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)) ? 0.9 : 0;
  return Math.max(ratio(a, b), ratio(phonetic(a), phonetic(b)), prefix);
}
function nameSim(x, y) {
  const a = words(x);
  const b = words(y);
  if (!a.length || !b.length) return 0;
  const whole = wordSim(a.join(""), b.join(""));
  const first = wordSim(a[0], b[0]);
  const byWord = a.length > 1 && b.length > 1 ? 0.75 * first + 0.25 * wordSim(a.slice(1).join(""), b.slice(1).join("")) : 0.95 * first;
  return Math.max(whole, byWord);
}

// ---------------------------------------------------------------------------
// Discrepancies (one row per issue, written to the CSV)
// ---------------------------------------------------------------------------
const issues = [];
function issue(category, review, { p = null, sheetLine = null, tx = null, detail, action }) {
  issues.push({ category, review, p, sheetLine: sheetLine ?? p?.line ?? null, tx, detail, action });
}

// ---------------------------------------------------------------------------
// 1. Parse and validate the dues sheet
// ---------------------------------------------------------------------------
function readCsv(file) {
  const parsed = Papa.parse(fs.readFileSync(file, "utf8"), { header: false, skipEmptyLines: false });
  if (parsed.errors.length) throw new Error(`${file}: CSV parse errors ${JSON.stringify(parsed.errors.slice(0, 5))}`);
  return parsed.data;
}

const duesRows = readCsv(opts.dues);
const header = duesRows[0].map(clean);
const expectHeader = ["Class", "Student Name", "Father Name", "Previous Fees", "Current Fees", "Current Vehicle",
  "Previous Deposit", "Current Fees Deposit", "Current Vehicle Deposit", "Previous Fees Discount", "Current Fees Discount",
  "Current Vehicle Discount", "Previous Due", "Current Due Fees", "Current Vechicle Due", "Total Deposit", "Total Due",
  "Date", "Clear/Due", "Mode", "Discription", "Remarks", "Siblings", "Date Last Called", "Who Picked the call", "Conversation"];
if (expectHeader.some((h, i) => header[i] !== h)) throw new Error("Unexpected dues-sheet columns: " + header.join(" | "));

const classByCode = new Map(CLASSES.map(([code, name], i) => [code, { code, name, sort_order: i + 1 }]));
const sheet = [];
const fatal = [];
duesRows.slice(1).forEach((r, i) => {
  const line = i + 2;
  const cls = clean(r[0]).toUpperCase();
  const rawName = clean(r[1]);
  if (!cls || !rawName) {
    const content = r.map(clean).filter(Boolean);
    if (content.length) {
      issue("Dues sheet row skipped", "Yes", { sheetLine: line,
        detail: `Row has no class or student name but contains: ${r.map((v, k) => (clean(v) ? `${header[k]}="${clean(v)}"` : "")).filter(Boolean).join(", ")}`,
        action: "Not imported" });
    }
    return;
  }
  if (!classByCode.has(cls)) { fatal.push(`Dues sheet row ${line}: unknown class "${r[0]}"`); return; }
  const values = r.slice(3, 17).map(num);
  if (values.some((x) => x === null || x < 0)) {
    fatal.push(`Dues sheet row ${line} ${rawName}: a money cell is not a positive number (${r.slice(3, 17).join(" | ")})`);
    return;
  }
  const [pf, cf, cv, pd, cd, vd, pdi, cdi, vdi, pdu, cdu, vdu, td, tdu] = values.map(paise);
  // the sheet's own arithmetic must hold, otherwise the import could not match it
  const checks = [[pf - pd - pdi, pdu, "Previous Due"], [cf - cd - cdi, cdu, "Current Due Fees"], [cv - vd - vdi, vdu, "Current Vechicle Due"],
    [pd + cd + vd, td, "Total Deposit"], [pdu + cdu + vdu, tdu, "Total Due"]];
  for (const [calc, given, what] of checks) {
    if (calc !== given) fatal.push(`Dues sheet row ${line} ${rawName}: ${what} is ${inr(given)} but the other columns give ${inr(calc)}`);
  }

  const fixKey = `${line}|${cls}|${rawName.toUpperCase()}|${clean(r[2]).toUpperCase()}`;
  const fix = NAME_FIXES[fixKey];
  const name = fix ? fix.name : titleCase(rawName);
  if (fix) issue("Student name corrected", "Yes", { sheetLine: line, detail: fix.why, action: `Imported as "${name}" - please confirm` });

  const rawDate = clean(r[17]);
  const date = sheetDate(rawDate);
  if (rawDate && !date) issue("Unreadable date in dues sheet", "Yes", { sheetLine: line, detail: `Date cell "${rawDate}"`, action: "Date ignored" });

  sheet.push({
    line, cls, name, rawName, father: titleCase(r[2]) || null,
    pf, cf, cv, pd, cd, vd, pdi, cdi, vdi, pdu, cdu, vdu, td, tdu,
    date, rawDate, status: clean(r[18]).toLowerCase(), rawMode: clean(r[19]), mode: mapMode(r[19]),
    desc: clean(r[20]), remarks: clean(r[21]), siblings: clean(r[22]),
    called: clean(r[23]), who: clean(r[24]), conversation: clean(r[25]),
  });
});
if (fatal.length) {
  console.error("The dues sheet has errors the import cannot work around:\n  " + fatal.join("\n  "));
  process.exit(1);
}

// same student twice?
{
  const seen = new Map();
  for (const s of sheet) {
    const key = `${s.cls}|${words(s.name).join(" ")}|${words(s.father ?? "").join(" ")}`;
    if (seen.has(key)) {
      issue("Possible duplicate student", "Yes", { sheetLine: s.line,
        detail: `Same class, name and father as dues sheet row ${seen.get(key).line} (${s.cls} ${s.name} / ${s.father ?? "-"})`,
        action: "Both rows imported as separate students - please confirm" });
    } else seen.set(key, s);
  }
}

// School fee per class (without admission): the most common "Current Fees", less the admission
// fee when that also appears (Play is nearly all new admissions, so its most common fee includes it)
const classFee = new Map();
for (const [code] of CLASSES) {
  const counts = new Map();
  for (const s of sheet) if (s.cls === code && s.cf > 0) counts.set(s.cf, (counts.get(s.cf) ?? 0) + 1);
  const mode = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const adm = paise(ADMISSION_FEE[code]);
  classFee.set(code, counts.has(mode - adm) ? mode - adm : mode);
}

// ---------------------------------------------------------------------------
// 2. Students, charges and notes
// ---------------------------------------------------------------------------
const plan = sheet.map((s, idx) => {
  const admission_no = ADMISSION_PREFIX + String(idx + 1).padStart(4, "0");
  const isRte = /R\.\s*T\.\s*E\./i.test(s.remarks);
  const leftText = [s.desc, s.remarks].find((t) => /left school|school chhod/i.test(t));
  const noData = !isRte && s.pf + s.cf + s.cv + s.pd + s.cd + s.vd + s.pdi + s.cdi + s.vdi === 0;
  const base = classFee.get(s.cls);
  const admFee = paise(ADMISSION_FEE[s.cls]);
  const admission = s.cf === base + admFee ? admFee : 0;
  const schoolFee = s.cf - admission;
  const charges = [];

  // previous-year balance
  if (s.pf > 0) {
    charges.push({ key: "prev", group: "prev", session: "prev", item: PREVIOUS_ITEM.number, amount: s.pf, concession: s.pdi,
      source: "opening", note: `Balance from ${PREVIOUS.name} (fees sheet)` + (s.pdi ? "; discount as per sheet" : "") });
  }
  // discount comes off the school fee (last installment first), then the admission fee
  const schoolConc = Math.min(s.cdi, schoolFee);
  const admissionConc = s.cdi - schoolConc;
  if (admissionConc > admission) throw new Error(`Row ${s.line} ${s.name}: discount larger than the fees`);
  if (admission > 0) {
    charges.push({ key: "admission", group: "admission", session: "cur", item: itemFor("admission"), amount: admission,
      concession: admissionConc, source: "import", note: admissionConc ? "Discount as per sheet" : null });
  }
  if (s.cv > 0) {
    charges.push({ key: "transport", group: "transport", session: "cur", item: itemFor("transport"), amount: s.cv,
      concession: s.vdi, source: "import", note: s.vdi ? "Discount as per sheet" : null });
  }
  // school fee in installments; ₹0 lines when the sheet has a fee row but no school fee (RTE, transport only, ...)
  // so the fee structure's "Apply to students" never adds the class fee to them
  if (!noData) {
    const amounts = schoolFee > 0 ? splitEqual(schoolFee, SCHOOL_ITEMS.length) : SCHOOL_ITEMS.map(() => 0);
    const conc = spreadConcession(amounts, schoolConc);
    const custom = schoolFee !== base;
    const why = schoolFee === 0
      ? (isRte ? "RTE (no school fee in sheet)" : "No school fee in sheet")
      : custom ? `Sheet fee ${inr(schoolFee)} (class fee ${inr(base)})` : null;
    amounts.forEach((amount, i) => charges.push({
      key: `school${i + 1}`, group: "school", session: "cur", item: SCHOOL_ITEMS[i].number, amount, concession: conc[i],
      source: custom ? "import" : "structure",
      note: [why, conc[i] ? "Discount as per sheet" : null].filter(Boolean).join("; ") || null,
    }));
  }

  // the sheet's text columns, word for word
  const noteParts = [
    s.desc && `Description: ${s.desc}`,
    s.siblings && `Siblings: ${s.siblings}`,
    s.called && `Date last called: ${s.called}`,
    s.who && `Who picked the call: ${s.who}`,
    s.conversation && `Conversation: ${s.conversation}`,
  ].filter(Boolean);
  const notes = noteParts.length ? [`From fees sheet ${CURRENT.name}. ${noteParts.join(" | ")}`] : [];

  if (leftText) issue("Student marked as left", "Yes", { sheetLine: s.line,
    detail: `Sheet says "${leftText}". The sheet still shows ${inr(s.tdu)} due.`,
    action: "Status set to Left; all dues kept as in the sheet (date of leaving not known)" });
  if (noData) issue("No fees in dues sheet", "Yes", { sheetLine: s.line,
    detail: `${s.cls} ${s.name}: every money column is blank or 0 and the student is not marked R.T.E.`,
    action: "Student imported without any fee lines (note: the fee structure's \"Apply to students\" would add the class fee)" });
  if (isRte && schoolFee > 0) issue("R.T.E. student with a school fee", "Yes", { sheetLine: s.line,
    detail: `Remarks say R.T.E. but Current Fees is ${inr(s.cf)}`, action: "Fee imported as in the sheet" });
  if (s.status === "clear" && s.tdu > 0) issue("Clear/Due column disagrees", "No", { sheetLine: s.line,
    detail: `Sheet says "clear" but its own columns leave ${inr(s.tdu)} due`, action: "Amounts imported as in the sheet" });
  if (s.status === "due" && s.tdu === 0) issue("Clear/Due column disagrees", "No", { sheetLine: s.line,
    detail: `Sheet says "due" but its own columns leave nothing due`, action: "Amounts imported as in the sheet" });
  if (s.rawMode && !s.mode) issue("Unknown payment mode in dues sheet", "No", { sheetLine: s.line,
    detail: `Mode cell "${s.rawMode}"`, action: "Mode treated as not recorded" });

  return {
    s, line: s.line, cls: s.cls, admission_no, isRte, admission, schoolFee,
    student: { admission_no, full_name: s.name, father_name: s.father, status: leftText ? "left" : "active", remarks: s.remarks || null },
    sheet: { fees: s.pf + s.cf + s.cv, discount: s.pdi + s.cdi + s.vdi, deposit: s.td, due: s.tdu,
      prev: { net: s.pf - s.pdi, paid: s.pd }, current: { net: s.cf - s.cdi, paid: s.cd }, vehicle: { net: s.cv - s.vdi, paid: s.vd } },
    charges, notes, txs: [], receipts: [], receiptSource: null,
  };
});
for (const p of plan) for (const i of issues) if (!i.p && i.sheetLine === p.line) i.p = p;

// ---------------------------------------------------------------------------
// 3. Transactions file: match each receipt to a student
// ---------------------------------------------------------------------------
const txRows = readCsv(opts.transactions);
{
  const head = txRows[0].map(clean);
  if (head[0] !== "Student Name" || head[1] !== "Father's Name" || head[2] !== "Class" || head[3] !== "Amount" || head[4] !== "Date" || head[5] !== "Remarks") {
    throw new Error("Unexpected transactions columns: " + head.join(" | "));
  }
}
const txs = [];
txRows.slice(1).forEach((r, i) => {
  const row = i + 2;
  const [name, father, clsText, amountText, dateText, catText] = r.slice(0, 6).map(clean);
  if (!r.some((x) => clean(x))) return;
  if (!father && !amountText && !dateText) { // a heading such as "Session 2025-26 (Last Year)"
    issue("Transactions row skipped", "No", { tx: { row, name, father, clsText, amountText, dateText, catText },
      detail: `Heading row "${name}"`, action: "Not imported (the rows below it are imported like the others)" });
    return;
  }
  const clsUp = clsText.toUpperCase();
  const cls = /^\d+$/.test(clsUp) ? ROMAN[+clsUp] ?? null : classByCode.has(clsUp) ? clsUp : null;
  const letters = catText.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const unknownLetters = letters.filter((x) => !TX_GROUPS[x]);
  const known = letters.filter((x) => TX_GROUPS[x]);
  const amount = num(amountText);
  txs.push({
    row, name, father, clsText, cls, amountText, dateText, catText,
    amount: amount === null ? null : paise(amount), date: sheetDate(dateText),
    groups: known.length ? GROUPS.filter((g) => known.some((x) => TX_GROUPS[x] === g)) : [...GROUPS],
    paidFor: known.map((x) => TX_WORDS[x]).join(" + ") || "not stated",
    unknownLetters, student: null, match: null,
  });
});

for (const tx of txs) {
  const problems = [];
  if (!tx.amount || tx.amount <= 0) problems.push(`amount "${tx.amountText}"`);
  if (!tx.date) problems.push(`date "${tx.dateText}"`);
  else if (tx.date < PREVIOUS.start_date || tx.date > TODAY) problems.push(`date ${tx.dateText} is outside ${PREVIOUS.start_date} .. ${TODAY}`);
  if (problems.length) {
    tx.invalid = true;
    issue("Unreadable transaction", "Yes", { tx, detail: `Unreadable ${problems.join(" and ")}`, action: "Not imported" });
    continue;
  }
  if (tx.unknownLetters.length) {
    issue("Unknown 'paid for' letters", "No", { tx, detail: `Remarks "${tx.catText}" has letters other than p, a, v, c (${tx.unknownLetters.join(", ")})`,
      action: "Unknown letters ignored" });
  }
  const cands = [];
  for (const p of plan) {
    const ns = nameSim(tx.name, p.student.full_name);
    if (ns < 0.75) continue;
    const fs_ = p.student.father_name ? nameSim(tx.father, p.student.father_name) : 0.5;
    cands.push({ p, ns, fs: fs_, same: tx.cls === p.cls, score: ns + fs_ });
  }
  cands.sort((a, b) => b.score - a.score);
  const exact = (c) => c.ns >= 0.999;
  const margin = (list) => (list.length > 1 ? list[0].score - list[1].score : 1);
  // 1. one student with the same name and father (class may be written differently, e.g. last year's)
  const strongExact = cands.filter((c) => exact(c) && c.fs >= 0.999);
  const strong = cands.filter((c) => c.ns >= 0.95 && c.fs >= 0.9);
  // 2. clearly the best name + father in the same class
  const sameClass = cands.filter((c) => c.same);
  let best = null;
  let rule = null;
  if (strongExact.length === 1) { best = strongExact[0]; rule = "same name and father"; }
  else if (strong.length === 1) { best = strong[0]; rule = "similar name and father"; }
  else if (sameClass[0] && sameClass[0].ns >= 0.8 && sameClass[0].fs >= 0.6 && margin(sameClass) >= 0.15) { best = sameClass[0]; rule = "best name and father in the class"; }
  // 3. elsewhere: similar name and father, well ahead of anyone else
  else if (cands[0] && cands[0].ns >= 0.85 && cands[0].fs >= 0.8 && margin(cands) >= 0.2) { best = cands[0]; rule = "similar name and father, other class"; }
  const describe = (c) => `${c.p.admission_no} ${c.p.cls} ${c.p.student.full_name} / ${c.p.student.father_name ?? "-"} (dues sheet row ${c.p.line})`;
  if (best) {
    tx.student = best.p;
    tx.score = { ns: best.ns, fs: best.fs, rule };
    best.p.txs.push(tx);
    const notes = [];
    if (words(tx.name).join(" ") !== words(best.p.student.full_name).join(" ")) notes.push("name spelled differently");
    if (best.fs < 0.999) notes.push("father's name written differently");
    if (!best.same) notes.push(`class ${tx.clsText || "-"} in transactions, ${best.p.cls} in dues sheet`);
    tx.match = notes.length ? `Matched to ${describe(best)}: ${notes.join(", ")}` : `Matched to ${describe(best)}`;
    tx.weak = best.ns < 0.9 || best.fs < 0.8;
  } else {
    tx.cands = cands;
    tx.closest = cands.slice(0, 2).map(describe);
    tx.match = cands.length ? `No safe match. Closest: ${tx.closest.join("; ")}` : "No similar name in the dues sheet";
  }
}

// Itemised payments the sheet writes in Description / Remarks, with valid dates
for (const p of plan) {
  p.notesPaid = paymentsInText(`${p.s.desc} ${p.s.remarks}`).filter((x) => x.date && x.date >= PREVIOUS.start_date && x.date <= TODAY);
}
// Second pass for receipts whose father's name differs: same name and class, and the amount and date are
// exactly what the dues sheet shows for a student no other receipt matched (the whole deposit on the sheet's
// Date, or an itemised note).
for (const tx of txs.filter((x) => !x.invalid && !x.student && x.cands?.length)) {
  const fits = tx.cands.filter((c) => c.same && c.ns >= 0.9 && !c.p.txs.length && (
    (c.p.sheet.deposit === tx.amount && c.p.s.date === tx.date) || c.p.notesPaid.some((n) => n.amount === tx.amount && n.date === tx.date)));
  if (fits.length !== 1) continue;
  const c = fits[0];
  tx.student = c.p;
  tx.score = { ns: c.ns, fs: c.fs, rule: "name, class, amount and date" };
  tx.weak = true;
  c.p.txs.push(tx);
  tx.match = `Matched to ${c.p.admission_no} ${c.p.cls} ${c.p.student.full_name} / ${c.p.student.father_name ?? "-"} (dues sheet row ${c.p.line}): ` +
    `father's name differs ("${tx.father}"), but name, class, amount and date are exactly the dues sheet's`;
}
// Students (other than `except`) whose sheet shows this receipt's amount on its date, to help a reviewer
function elsewhere(tx, except = null) {
  const hits = plan.filter((p) => p !== except &&
    ((p.sheet.deposit === tx.amount && p.s.date === tx.date) || p.notesPaid.some((n) => n.amount === tx.amount && n.date === tx.date)));
  return hits.length ? ` Dues sheet shows ${rupees(tx.amount)} on ${tx.dateText} for: ${hits.map((p) => `${p.admission_no} ${p.cls} ${p.student.full_name} / ${p.student.father_name ?? "-"} (row ${p.line})`).join("; ")}.` : "";
}
for (const tx of txs.filter((x) => !x.invalid && !x.student)) tx.match += elsewhere(tx);
// The same receipt written twice?
for (const p of plan) {
  for (const [i, a] of p.txs.entries()) {
    for (const b of p.txs.slice(i + 1)) {
      if (a.amount === b.amount && a.date === b.date) {
        issue("Same receipt twice in transactions", "Yes", { p, tx: b,
          detail: `Rows ${a.row} and ${b.row} are both ${rupees(a.amount)} on ${a.dateText} for this student`,
          action: "Both treated as separate receipts while reconciling with the dues sheet" });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Receipts per student
// ---------------------------------------------------------------------------
// Split receipts over fee groups. Each receipt pays the groups it names in the order previous
// dues -> admission -> transport -> school fee, capped by what is due on the group and by the
// dues sheet's deposit for its column. Receipts naming one deposit column go first, so a receipt
// that may pay several kinds of fee gets what the others leave. Money a receipt cannot place
// where it says goes where the dues sheet still shows a deposit (marked "adjusted").
function splitReceipts(p, receipts) {
  const groupLeft = Object.fromEntries(GROUPS.map((g) => [g, sum(p.charges.filter((c) => c.group === g), (c) => c.amount - c.concession)]));
  const poolLeft = { prev: p.s.pd, current: p.s.cd, vehicle: p.s.vd };
  const give = (r, g) => {
    const t = Math.min(r.left, groupLeft[g], poolLeft[POOL[g]]);
    if (t > 0) { r.byGroup[g] += t; r.left -= t; groupLeft[g] -= t; poolLeft[POOL[g]] -= t; }
    return t;
  };
  for (const r of receipts) {
    r.byGroup = Object.fromEntries(GROUPS.map((g) => [g, 0]));
    r.left = r.amount;
    r.pools = new Set(r.groups.map((g) => POOL[g]));
  }
  const single = receipts.filter((r) => r.pools.size === 1);
  const multi = receipts.filter((r) => r.pools.size > 1);
  for (const r of [...single, ...multi]) for (const g of GROUPS) if (r.groups.includes(g)) give(r, g);
  for (const r of receipts) {
    // same deposit column first (e.g. "admission" for a student without an admission fee line pays the school fee)
    for (const g of GROUPS) if (r.pools.has(POOL[g])) give(r, g);
    for (const g of GROUPS) if (give(r, g) > 0) r.adjusted = true;
    if (r.left > 0) throw new Error(`${p.admission_no} ${p.student.full_name}: receipts exceed the dues-sheet deposit`);
  }
}

const describeTx = (tx) => `row ${tx.row}: ${rupees(tx.amount)} on ${tx.dateText} (${tx.catText || "-"})`;
const sheetDeposits = (p) => `deposits previous ${rupees(p.s.pd)}, current ${rupees(p.s.cd)}, vehicle ${rupees(p.s.vd)} (total ${rupees(p.s.td)})`;

const fromNote = (n) => ({ amount: n.amount, paid_on: n.date, mode: n.online ? "bank_transfer" : null, groups: [...GROUPS], why: `dues sheet note "${n.text}"` });
const shown = (list, x) => list.some((t) => t.amount === x.amount && t.date === (x.date ?? x.paid_on));

// Receipts made from the dues sheet for an amount the transactions do not show: itemised notes
// ("4000 on 1-10-26") that no imported receipt already shows keep their dates; the rest goes on the
// sheet's Date when no imported receipt is on that date, otherwise its date is not known.
function sheetReceipts(p, amount, imported) {
  const s = p.s;
  const items = [];
  let left = amount;
  for (const n of p.notesPaid) {
    if (shown(imported, n) || n.amount > left) continue;
    items.push(fromNote(n));
    left -= n.amount;
  }
  if (left > 0) {
    const used = [...imported.map((t) => t.date), ...items.map((x) => x.paid_on)];
    items.push(s.date && !used.includes(s.date)
      ? { amount: left, paid_on: s.date, mode: null, groups: [...GROUPS], why: `dues sheet deposit, on the sheet's Date ${s.rawDate}` }
      : { amount: left, paid_on: null, mode: null, groups: [...GROUPS], why: "dues sheet deposit, date not recorded" });
  }
  return items;
}
const listReceipts = (items) => items.map((r) => `${rupees(r.amount)} on ${r.paid_on ? dmy(r.paid_on) : `${dmy(UNDATED)} (date not recorded)`}`).join(", ");

// Subsets of transactions that add up to an amount (students have few transactions)
function subsetsSumming(list, target) {
  const out = [];
  const n = list.length;
  if (n > 16) return out;
  for (let mask = 1; mask < 1 << n; mask++) {
    let t = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) t += list[i].amount;
    if (t === target) out.push(list.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

// Of several sets of transactions that add up to an amount, keep the ones the sheet itself points to:
// those holding every transaction it itemises ("4000 on 19-8-26"), then those with one on its Date.
function pickSets(p, list, target) {
  const narrow = (sets, keep) => (sets.some(keep) ? sets.filter(keep) : sets);
  let sets = subsetsSumming(list, target);
  const noted = list.filter((t) => shown(p.notesPaid, t));
  if (sets.length > 1 && noted.length) sets = narrow(sets, (set) => noted.every((t) => set.includes(t)));
  if (sets.length > 1 && p.s.date) sets = narrow(sets, (set) => set.some((t) => t.date === p.s.date));
  return sets;
}

for (const p of plan) {
  const deposit = p.sheet.deposit;
  const txTotal = sum(p.txs, (x) => x.amount);
  const fromTx = (list) => list.map((tx) => ({ amount: tx.amount, paid_on: tx.date, groups: tx.groups, tx, mode: null, why: `transactions row ${tx.row} (${tx.paidFor})` }));
  const sheetText = [p.s.desc && `Description "${p.s.desc}"`, p.s.remarks && `Remarks "${p.s.remarks}"`].filter(Boolean).join(", ");
  const txList = `Transactions ${p.txs.map(describeTx).join("; ")} add up to ${rupees(txTotal)}; dues sheet ${sheetDeposits(p)}` +
    (p.s.rawDate ? `, Date ${p.s.rawDate}` : "") + (sheetText ? `, ${sheetText}` : "") + ".";
  let items = [];
  if (!p.txs.length) {
    if (deposit > 0) {
      items = sheetReceipts(p, deposit, []);
      p.receiptSource = "sheet";
      const possible = txs.filter((x) => !x.student && !x.invalid && (x.closest?.some((c) => c.startsWith(p.admission_no + " ")) || x.match.includes(`${p.admission_no} `)));
      issue("Deposit without transactions", "Yes", { p,
        detail: `Dues sheet shows ${sheetDeposits(p)}${p.s.rawDate ? `, Date ${p.s.rawDate}` : ""}${sheetText ? `, ${sheetText}` : ""}; no transaction matched this student.` +
          (possible.length ? ` Possibly unmatched transactions ${possible.map(describeTx).join("; ")}.` : ""),
        action: `Receipts made from the dues sheet: ${listReceipts(items)}` });
    }
  } else if (txTotal === deposit) {
    items = fromTx(p.txs);
    p.receiptSource = "transactions";
  } else if (txTotal < deposit) {
    const extra = sheetReceipts(p, deposit - txTotal, p.txs);
    items = [...fromTx(p.txs), ...extra];
    p.receiptSource = "transactions + sheet";
    issue("Transactions less than dues-sheet deposit", "Yes", { p,
      detail: `${txList} Short by ${rupees(deposit - txTotal)}.`,
      action: `All transactions imported, plus receipts made from the dues sheet: ${listReceipts(extra)} (${extra.map((r) => r.why).join("; ")})` });
  } else {
    let sets = pickSets(p, p.txs, deposit);
    let extra = [];
    if (!sets.length) {
      // the sheet's itemised notes that no transaction shows, plus a set of the transactions
      const unseen = p.notesPaid.filter((n) => !shown(p.txs, n));
      const rest = deposit - sum(unseen, (n) => n.amount);
      if (unseen.length && rest > 0) {
        const withNotes = pickSets(p, p.txs, rest);
        if (withNotes.length === 1) { sets = withNotes; extra = unseen.map(fromNote); }
      }
    }
    if (sets.length === 1) {
      const keep = new Set(sets[0]);
      items = [...fromTx(sets[0]), ...extra];
      p.receiptSource = extra.length ? "transactions + sheet" : "transactions";
      for (const tx of p.txs.filter((x) => !keep.has(x))) {
        tx.excluded = true;
        issue("Transaction not in dues-sheet deposit", "Yes", { p, tx,
          detail: `${txList} Only rows ${sets[0].map((x) => x.row).join(" + ")}${extra.length ? ` with the sheet's note${extra.length > 1 ? "s" : ""} ${extra.map((x) => x.why.replace("dues sheet note ", "")).join(", ")}` : ""} add up to the deposit.` + elsewhere(tx, p),
          action: "Not imported (left out so the student's dues match the sheet)" +
            (extra.length ? `; receipts made from the dues sheet: ${listReceipts(extra)}` : "") });
      }
    } else {
      // several sets fit: the transactions in every one of them are certain, the rest of the deposit comes from the sheet
      const common = sets.length > 1 ? p.txs.filter((t) => sets.every((set) => set.includes(t))) : [];
      const fill = deposit > 0 ? sheetReceipts(p, deposit - sum(common, (t) => t.amount), common) : [];
      items = [...fromTx(common), ...fill];
      p.receiptSource = common.length ? "transactions + sheet" : fill.length ? "sheet" : null;
      for (const tx of p.txs.filter((t) => !common.includes(t))) {
        tx.excluded = true;
        issue("Transactions do not match dues-sheet deposit", "Yes", { p, tx,
          detail: `${txList} ` + (sets.length
            ? `${sets.length} different sets of them add up to the deposit, so it is not clear which are right${common.length ? ` (row${common.length > 1 ? "s" : ""} ${common.map((t) => t.row).join(", ")} ${common.length > 1 ? "are" : "is"} in every set and imported)` : ""}.`
            : "No set of them adds up to the deposit.") + elsewhere(tx, p),
          action: "Not imported" + (fill.length ? `; receipts made from the dues sheet instead: ${listReceipts(fill)}` : "") });
      }
    }
  }
  splitReceipts(p, items);
  for (const r of items.filter((x) => x.adjusted && x.tx)) {
    issue("'Paid for' differs from dues sheet", "No", { p, tx: r.tx,
      detail: `Transaction says ${r.tx.paidFor}; dues sheet ${sheetDeposits(p)}`,
      action: `Imported as ${groupWords(r.byGroup)} so the sheet's deposits match` });
  }
  for (const r of items.filter((x) => x.tx?.weak)) {
    issue("Transaction matched with differences", "Yes", { p, tx: r.tx, detail: r.tx.match, action: "Imported for this student - please confirm" });
  }
  p.receipts = items;
}
for (const tx of txs) {
  if (!tx.invalid && !tx.student) issue("Transaction without a student", "Yes", { tx, detail: tx.match, action: "Not imported" });
}

// receipt dates and modes
for (const p of plan) {
  for (const r of p.receipts) {
    // the sheet records one Mode per student; the school chose to apply it to all of that student's receipts
    // (an itemised "... online" note keeps its own mode)
    r.mode = r.mode ?? p.s.mode;
    if (!r.paid_on) { r.paid_on = UNDATED; r.undated = true; }
  }
}

// pin receipts to fee lines in date order (school-fee installments oldest first)
for (const p of plan) {
  const lineLeft = new Map(p.charges.map((c) => [c.key, c.amount - c.concession]));
  p.receipts.sort((a, b) => (a.paid_on ?? "").localeCompare(b.paid_on ?? "") || b.amount - a.amount);
  for (const r of p.receipts) {
    r.targets = [];
    for (const g of GROUPS) {
      let need = r.byGroup[g];
      for (const c of p.charges.filter((x) => x.group === g)) {
        const t = Math.min(need, lineLeft.get(c.key));
        if (t > 0) { r.targets.push({ key: c.key, amount: t }); lineLeft.set(c.key, lineLeft.get(c.key) - t); need -= t; }
      }
      if (need > 0) throw new Error(`${p.admission_no} ${p.student.full_name}: ${g} payment exceeds its charges`);
    }
    r.remarks = [
      r.tx ? `From transactions file row ${r.tx.row} (paid for: ${r.tx.paidFor})` : `From fees sheet: ${r.why}`,
      r.adjusted && r.tx ? "split adjusted to the fees sheet's deposits" : null,
      r.undated ? `date not recorded, placed on ${dmy(UNDATED)}` : null,
      r.mode ? null : "mode not recorded",
    ].filter(Boolean).join("; ");
  }
}
// receipt numbers in date order
let receiptSeq = 0;
plan.flatMap((p) => p.receipts.map((r) => ({ p, r })))
  .sort((a, b) => a.r.paid_on.localeCompare(b.r.paid_on) || a.p.admission_no.localeCompare(b.p.admission_no) || b.r.amount - a.r.amount)
  .forEach(({ r }) => { r.receipt_no = RECEIPT_PREFIX + String(++receiptSeq).padStart(4, "0"); });

// ---------------------------------------------------------------------------
// 5. Report and discrepancies file
// ---------------------------------------------------------------------------
const receipts = plan.flatMap((p) => p.receipts);
const lines = plan.flatMap((p) => p.charges);
console.log(`\nDues sheet: ${opts.dues}  (today ${TODAY})`);
console.log(`Students ${plan.length} · active ${plan.filter((p) => p.student.status === "active").length} · left ${plan.filter((p) => p.student.status === "left").length}`);
console.log("Per class:");
for (const [code, name] of CLASSES) {
  const ps = plan.filter((p) => p.cls === code);
  const adm = ps.filter((p) => p.admission > 0).length;
  console.log(`  ${name.padEnd(11)} ${String(ps.length).padStart(3)} students · school fee ${inr(classFee.get(code)).padEnd(9)} · admission ${inr(paise(ADMISSION_FEE[code]))} x ${String(adm).padStart(2)} · fees ${inr(sum(ps, (p) => p.sheet.fees)).padEnd(12)} deposit ${inr(sum(ps, (p) => p.sheet.deposit)).padEnd(11)} due ${inr(sum(ps, (p) => p.sheet.due))}`);
}
console.log(`Totals: fees ${inr(sum(plan, (p) => p.sheet.fees))} · discount ${inr(sum(plan, (p) => p.sheet.discount))} · deposit ${inr(sum(plan, (p) => p.sheet.deposit))} · due ${inr(sum(plan, (p) => p.sheet.due))}`);
console.log("Charges by fee:", GROUPS.map((g) => `${HEADS[g].name} ${inr(sum(lines.filter((c) => c.group === g), (c) => c.amount - c.concession))}`).join(" · "));
const matched = txs.filter((x) => x.student);
console.log(`\nTransactions: ${opts.transactions}`);
console.log(`  ${txs.length} rows (${inr(sum(txs, (x) => x.amount ?? 0))}) · matched ${matched.length} · imported ${matched.filter((x) => !x.excluded).length} (${inr(sum(matched.filter((x) => !x.excluded), (x) => x.amount))}) · matched but left out ${matched.filter((x) => x.excluded).length} (${inr(sum(matched.filter((x) => x.excluded), (x) => x.amount))}) · no student ${txs.filter((x) => !x.student && !x.invalid).length} (${inr(sum(txs.filter((x) => !x.student && !x.invalid), (x) => x.amount))}) · unreadable ${txs.filter((x) => x.invalid).length}`);
const bySource = {};
for (const p of plan.filter((x) => x.receiptSource)) (bySource[p.receiptSource] ??= []).push(p);
for (const [k, ps] of Object.entries(bySource)) console.log(`  receipts from ${k.padEnd(20)} ${String(ps.length).padStart(3)} students · ${inr(sum(ps, (p) => p.sheet.deposit))}`);
const fromSheet = receipts.filter((r) => !r.tx);
console.log(`Receipts ${receipts.length} (${inr(sum(receipts, (r) => r.amount))}) · from transactions ${receipts.length - fromSheet.length} · made from the dues sheet ${fromSheet.length} (${inr(sum(fromSheet, (r) => r.amount))}) · without a date ${receipts.filter((r) => r.undated).length} (${inr(sum(receipts.filter((r) => r.undated), (r) => r.amount))})`);
console.log("Received by fee:", GROUPS.map((g) => `${HEADS[g].name} ${inr(sum(receipts, (r) => r.byGroup[g]))}`).join(" · "));
const modes = {};
for (const r of receipts) modes[r.mode ?? "not recorded"] = (modes[r.mode ?? "not recorded"] ?? 0) + 1;
console.log("Receipts by mode:", Object.entries(modes).map(([m, n]) => `${m} ${n}`).join(" · "));
const byCat = {};
for (const i of issues) byCat[i.category] = (byCat[i.category] ?? 0) + 1;
console.log(`\nDiscrepancies (${issues.length}):`);
for (const [k, v] of Object.entries(byCat)) console.log(`  ${String(v).padStart(4)}  ${k}`);

const CAT_ORDER = ["Dues sheet row skipped", "Student name corrected", "Possible duplicate student", "No fees in dues sheet", "Student marked as left",
  "R.T.E. student with a school fee", "Unreadable date in dues sheet", "Unreadable transaction", "Transaction without a student",
  "Transaction matched with differences", "Same receipt twice in transactions",
  "Transactions do not match dues-sheet deposit", "Transaction not in dues-sheet deposit", "Transactions less than dues-sheet deposit",
  "Deposit without transactions", "'Paid for' differs from dues sheet", "Unknown 'paid for' letters", "Clear/Due column disagrees",
  "Unknown payment mode in dues sheet", "Transactions row skipped"];
const rank = (c) => (CAT_ORDER.indexOf(c) + 1 || 99);
const classRank = (p) => (p ? CLASSES.findIndex(([code]) => code === p.cls) : 99);
issues.sort((a, b) => rank(a.category) - rank(b.category) || classRank(a.p) - classRank(b.p) || (a.sheetLine ?? 0) - (b.sheetLine ?? 0) || (a.tx?.row ?? 0) - (b.tx?.row ?? 0));
const csvRows = issues.map((i, n) => ({
  "#": n + 1,
  "Issue": i.category,
  "Needs review": i.review,
  "What the import did": i.action,
  "Details": i.detail,
  "Adm No": i.p?.admission_no ?? "",
  "Class": i.p?.cls ?? "",
  "Student": i.p?.student.full_name ?? "",
  "Father": i.p?.student.father_name ?? "",
  "Dues Sheet Row": i.sheetLine ?? "",
  "Sheet Total Deposit": i.p ? rupees(i.p.sheet.deposit) : "",
  "Sheet Total Due": i.p ? rupees(i.p.sheet.due) : "",
  "Tx Row": i.tx?.row ?? "",
  "Tx Student": i.tx?.name ?? "",
  "Tx Father": i.tx?.father ?? "",
  "Tx Class": i.tx?.clsText ?? "",
  "Tx Amount": i.tx?.amount ? rupees(i.tx.amount) : (i.tx?.amountText ?? ""),
  "Tx Date": i.tx?.dateText ?? "",
  "Tx Paid For": i.tx?.catText ?? "",
}));
fs.writeFileSync(opts.out, "\ufeff" + Papa.unparse(csvRows) + "\r\n");
console.log(`\nDiscrepancies file written: ${opts.out} (${csvRows.length} rows)`);
if (opts.plan) {
  fs.writeFileSync(opts.plan, JSON.stringify({ classFee: Object.fromEntries(classFee),
    plan: plan.map(({ s, txs: t, receipts: rs, ...p }) => ({ ...p, sheetRow: s, txRows: t.map((x) => ({ row: x.row, excluded: !!x.excluded, match: x.match, score: x.score })),
      receipts: rs.map(({ tx, pools, ...r }) => ({ ...r, pools: [...(pools ?? [])], txRow: tx?.row })) })),
    txs: txs.map((x) => ({ ...x, cands: undefined, student: x.student?.admission_no ?? null })) }, null, 1));
  console.log(`Plan written to ${opts.plan}`);
}
if (!opts.apply) {
  console.log("\nDry run only. Re-run with --apply to load this data.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 6. Load the database (one transaction; committed only when every check passes)
// ---------------------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(ROOT, file));
  } catch {
    // optional
  }
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Put it in .env.local.");
pg.types.setTypeParser(20, Number); // bigint (paise, counts)
pg.types.setTypeParser(1700, Number); // numeric (sums)
pg.types.setTypeParser(1082, (v) => v); // dates stay YYYY-MM-DD
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

// multi-row insert in chunks; rows come back with the requested columns (matched by key, not by order)
async function insert(table, columns, rows, returning = null) {
  const out = [];
  const per = Math.floor(30000 / columns.length);
  for (let i = 0; i < rows.length; i += per) {
    const params = [];
    const values = rows.slice(i, i + per).map((r) => `(${columns.map((c) => { params.push(r[c] ?? null); return `$${params.length}`; }).join(", ")})`);
    const res = await client.query(`insert into public.${table} (${columns.join(", ")}) values ${values.join(", ")}${returning ? ` returning ${returning}` : ""}`, params);
    out.push(...res.rows);
  }
  if (returning && out.length !== rows.length) throw new Error(`insert ${table}: ${out.length} of ${rows.length} rows returned`);
  return out;
}

const FEE_TABLES = ["allocations", "payment_targets", "payments", "student_notes", "student_charges", "enrollments", "students",
  "fee_structures", "collection_targets", "monthly_snapshots", "receipt_counters", "installments", "academic_sessions", "classes", "fee_heads"];
const host = new URL(process.env.DATABASE_URL).hostname;
let committed = false;
try {
  await client.query("begin");
  await client.query("select set_config('fees.skip_realloc', 'on', true)");

  const existing = {};
  for (const t of FEE_TABLES) existing[t] = (await q(`select count(*) as n from public.${t}`))[0].n;
  const held = Object.entries(existing).filter(([, n]) => n > 0);
  console.log(`\nDatabase ${host}: ${held.length ? held.map(([t, n]) => `${t} ${n}`).join(", ") : "no fee data"}`);
  if (held.length && !opts.replace) throw new Error("The database already holds fee data. Re-run with --replace to delete it and load these files instead.");
  if (held.length) {
    for (const t of FEE_TABLES) await client.query(`delete from public.${t}`);
    console.log("Existing fee data deleted (inside this transaction).");
  }
  const order = (await q("select allocation_order from public.school_settings where id = 1"))[0]?.allocation_order;
  if (order !== "oldest_first") console.log(`Note: Settings → allocation order is "${order}"; the school's rule (previous dues first) is "oldest_first".`);

  // sessions and payable items
  const sessions = await insert("academic_sessions", ["name", "start_date", "end_date", "is_current"],
    [{ ...PREVIOUS, is_current: false }, { ...CURRENT, is_current: true }], "id, name");
  const sessionId = { prev: sessions.find((s) => s.name === PREVIOUS.name).id, cur: sessions.find((s) => s.name === CURRENT.name).id };
  const insts = await insert("installments", ["session_id", "number", "name", "due_date"], [
    { session_id: sessionId.prev, ...PREVIOUS_ITEM },
    ...SCHEDULE.map(({ number, name, due_date }) => ({ session_id: sessionId.cur, number, name, due_date })),
  ], "id, session_id, number");
  const instId = (session, n) => insts.find((i) => i.session_id === sessionId[session] && i.number === n).id;

  const classes = await insert("classes", ["name", "sort_order"], CLASSES.map(([, name], i) => ({ name, sort_order: i + 1 })), "id, name");
  const classId = (code) => classes.find((c) => c.name === classByCode.get(code).name).id;
  const heads = await insert("fee_heads", ["name", "priority"], GROUPS.map((g) => HEADS[g]), "id, name");
  const headId = (g) => heads.find((h) => h.name === HEADS[g].name).id;

  // fee structure: the school fee of each class (admission and transport are per student)
  await insert("fee_structures", ["class_id", "installment_id", "fee_head_id", "amount"], CLASSES.filter(([code]) => classFee.get(code) > 0).flatMap(([code]) =>
    splitEqual(classFee.get(code), SCHOOL_ITEMS.length).map((amount, i) => ({
      class_id: classId(code), installment_id: instId("cur", SCHOOL_ITEMS[i].number), fee_head_id: headId("school"), amount }))));

  const students = await insert("students", ["admission_no", "full_name", "father_name", "status", "remarks"], plan.map((p) => p.student), "id, admission_no");
  const sid = new Map(students.map((s) => [s.admission_no, s.id]));
  await insert("enrollments", ["student_id", "session_id", "class_id", "section"],
    plan.map((p) => ({ student_id: sid.get(p.admission_no), session_id: sessionId.cur, class_id: classId(p.cls), section: "A" })));

  const chargeRows = plan.flatMap((p) => p.charges.map((c) => ({
    student_id: sid.get(p.admission_no), session_id: sessionId[c.session], installment_id: instId(c.session, c.item),
    fee_head_id: headId(c.group), amount: c.amount, concession: c.concession, source: c.source, note: c.note,
  })));
  const charges = await insert("student_charges", ["student_id", "session_id", "installment_id", "fee_head_id", "amount", "concession", "source", "note"],
    chargeRows, "id, student_id, installment_id, fee_head_id");
  const chargeKey = new Map(charges.map((c) => [`${c.student_id}|${c.installment_id}|${c.fee_head_id}`, c.id]));
  const chargeFor = (p, key) => {
    const c = p.charges.find((x) => x.key === key);
    return chargeKey.get(`${sid.get(p.admission_no)}|${instId(c.session, c.item)}|${headId(c.group)}`);
  };

  const payRows = plan.flatMap((p) => p.receipts.map((r) => ({
    receipt_no: r.receipt_no, student_id: sid.get(p.admission_no),
    session_id: r.paid_on < CURRENT.start_date ? sessionId.prev : sessionId.cur,
    paid_on: r.paid_on, amount: r.amount, mode: r.mode ?? "other", remarks: r.remarks, source: "import",
  })));
  const payments = await insert("payments", ["receipt_no", "student_id", "session_id", "paid_on", "amount", "mode", "remarks", "source"], payRows, "id, receipt_no");
  const payId = new Map(payments.map((x) => [x.receipt_no, x.id]));
  const targetRows = plan.flatMap((p) => p.receipts.flatMap((r) => r.targets.map((t) => ({
    payment_id: payId.get(r.receipt_no), charge_id: chargeFor(p, t.key), amount: t.amount }))));
  await insert("payment_targets", ["payment_id", "charge_id", "amount"], targetRows);

  const noteRows = plan.flatMap((p) => p.notes.map((note) => ({ student_id: sid.get(p.admission_no), note })));
  await insert("student_notes", ["student_id", "note"], noteRows);

  await client.query("select set_config('fees.skip_realloc', 'off', true)");
  await client.query("select public.reallocate_all()");

  // ---- checks against the dues sheet, straight from the tables -------------------------------------------
  console.log("Checking every student against the dues sheet ...");
  const problems = [];
  const add = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v);
  const dbCharges = await q("select student_id, fee_head_id, net_amount from public.student_charges");
  const dbAlloc = await q("select payment_id, student_id, charge_id, fee_head_id, amount from public.allocations");
  const headPool = new Map(GROUPS.map((g) => [headId(g), POOL[g]]));
  const netBy = new Map();
  const paidBy = new Map();
  for (const c of dbCharges) add(netBy, `${c.student_id}|${headPool.get(c.fee_head_id)}`, c.net_amount);
  for (const a of dbAlloc) if (a.charge_id) add(paidBy, `${a.student_id}|${headPool.get(a.fee_head_id)}`, a.amount);
  for (const p of plan) {
    for (const pool of POOLS) {
      const k = `${sid.get(p.admission_no)}|${pool}`;
      const net = netBy.get(k) ?? 0;
      const paid = paidBy.get(k) ?? 0;
      if (net !== p.sheet[pool].net || paid !== p.sheet[pool].paid) {
        problems.push(`${p.admission_no} ${p.student.full_name} ${POOL_WORDS[pool]}: database fees ${inr(net)} paid ${inr(paid)}, sheet ${inr(p.sheet[pool].net)} / ${inr(p.sheet[pool].paid)}`);
      }
    }
  }
  const allocByPay = new Map();
  for (const a of dbAlloc) add(allocByPay, a.payment_id, a.amount);
  for (const r of payRows) {
    const got = allocByPay.get(payId.get(r.receipt_no)) ?? 0;
    if (got !== r.amount) problems.push(`${r.receipt_no}: ${inr(got)} of ${inr(r.amount)} allocated`);
  }
  const advance = sum(dbAlloc.filter((a) => !a.charge_id), (a) => a.amount);
  if (advance) problems.push(`${inr(advance)} allocated as advance (no fee line)`);
  const planned = new Map(targetRows.map((t) => [`${t.payment_id}|${t.charge_id}`, t.amount]));
  const actual = new Map();
  for (const a of dbAlloc) add(actual, `${a.payment_id}|${a.charge_id}`, a.amount);
  for (const [k, v] of planned) if (actual.get(k) !== v) problems.push(`allocation ${k}: ${inr(actual.get(k) ?? 0)}, planned ${inr(v)}`);
  if (actual.size !== planned.size) problems.push(`${actual.size} allocation lines, ${planned.size} planned`);
  const [counts] = await q(`select (select count(*) from public.students) as students, (select count(*) from public.enrollments) as enrollments,
    (select count(*) from public.student_charges) as charges, (select count(*) from public.payments) as payments,
    (select count(*) from public.payment_targets) as targets, (select count(*) from public.student_notes) as notes,
    (select coalesce(sum(amount), 0) from public.payments) as received`);
  const want = { students: plan.length, enrollments: plan.length, charges: chargeRows.length, payments: payRows.length, targets: targetRows.length,
    notes: noteRows.length, received: sum(payRows, (r) => r.amount) };
  for (const [k, v] of Object.entries(want)) if (counts[k] !== v) problems.push(`${k}: database ${counts[k]}, expected ${v}`);

  // ---- the same through the app's own SQL functions, as a temporary admin that is rolled back -------------
  console.log("Checking with the app's own balance and reconciliation functions ...");
  await client.query("savepoint app_check");
  const [checker] = await q("insert into public.app_users (email, password_hash) values ($1, 'not-a-login') returning id", [`import-check-${Date.now()}@invalid`]);
  await client.query("update public.profiles set role = 'admin' where id = $1", [checker.id]);
  await client.query("select set_config('app.user_id', $1, true)", [checker.id]);
  const balances = await q("select * from public.student_balances($1)", [sessionId.cur]);
  const balBy = new Map(balances.map((b) => [b.admission_no, b]));
  for (const p of plan) {
    const b = balBy.get(p.admission_no);
    if (!b) { problems.push(`${p.admission_no}: missing from student_balances`); continue; }
    const fees = b.expected + b.prev_opening;
    const got = b.received + b.prev_recovered;
    const cls = classByCode.get(p.cls).name;
    if (fees !== p.sheet.fees - p.sheet.discount || got !== p.sheet.deposit || b.total_pending !== p.sheet.due || b.advance_balance !== 0 || b.class_name !== cls) {
      problems.push(`${p.admission_no} ${p.student.full_name} (app): fees ${inr(fees)} received ${inr(got)} pending ${inr(b.total_pending)} advance ${inr(b.advance_balance)} class ${b.class_name}; ` +
        `sheet ${inr(p.sheet.fees - p.sheet.discount)} / ${inr(p.sheet.deposit)} / ${inr(p.sheet.due)} / ${cls}`);
    }
  }
  const appTotals = { pending: sum(balances, (b) => b.total_pending), received: sum(balances, (b) => b.received + b.prev_recovered) };
  const warnings = [];
  const noPlan = plan.filter((p) => !p.charges.length && p.student.status === "active").length;
  for (const [label, id] of [[CURRENT.name, sessionId.cur], [PREVIOUS.name, sessionId.prev]]) {
    const [{ reconciliation: rec }] = await q("select public.reconciliation($1)", [id]);
    for (const c of rec.checks) {
      if (c.ok || c.info) continue;
      // the students the sheet gives no fees at all are expected here
      if (c.key === "enrolled_without_plan" && label === CURRENT.name && c.left === noPlan) {
        warnings.push(`${label}: ${c.label}: ${c.left} (the students with no fees in the sheet)`);
        continue;
      }
      problems.push(`${label} reconciliation "${c.label}": ${c.left} vs ${c.right}`);
    }
  }
  await client.query("rollback to savepoint app_check");
  await client.query("select set_config('app.user_id', '', true)");

  if (problems.length) throw new Error(`${problems.length} check(s) failed, nothing was saved:\n  ${problems.slice(0, 50).join("\n  ")}`);

  if (!opts.rollback) {
    await insert("audit_log", ["action", "entity", "details"], [{ action: "import_fees_sheet", entity: "students", details: JSON.stringify({
      dues_file: path.basename(opts.dues), transactions_file: path.basename(opts.transactions), replaced: held.length > 0,
      students: plan.length, charges: chargeRows.length, receipts: payRows.length, receipts_from_sheet: receipts.filter((r) => !r.tx).length,
      discrepancies: issues.length, deposit: sum(plan, (p) => p.sheet.deposit), due: sum(plan, (p) => p.sheet.due),
    }) }]);
    await client.query("commit");
    committed = true;
  }
  console.log(`\n${committed ? "Saved" : "Rehearsal passed"}. Students ${counts.students} · enrolments ${counts.enrollments} · fee lines ${counts.charges} · receipts ${counts.payments} (${inr(counts.received)}) · notes ${counts.notes}`);
  console.log(`App totals: received ${inr(appTotals.received)} · pending ${inr(appTotals.pending)} (sheet: deposit ${inr(sum(plan, (p) => p.sheet.deposit))} · due ${inr(sum(plan, (p) => p.sheet.due))})`);
  for (const w of warnings) console.log(`Warning (expected): ${w}`);
  console.log("Every student's fees, discounts, deposits and dues match the dues sheet.");
  if (!committed) console.log("Rolled back (--rollback): nothing was saved.");
  const [{ n: logins }] = await q("select count(*) as n from public.app_users");
  if (committed && !logins) console.log("\nNo login exists yet. Create one with: npm run db:create-user -- --email <email> --password <password> --name <name>");
} finally {
  if (!committed) await client.query("rollback").catch(() => {});
  await client.end();
}
