// All money in the database is integer paise. These helpers turn it into rupees for display.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ₹1,23,456 (paise in). Shows paise only when present. */
export function rupees(paise: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const r = paise / 100;
  const abs = Math.abs(r);
  const body = Number.isInteger(abs) ? inr.format(abs) : inr2.format(abs);
  const sign = r < 0 ? "−" : opts.sign && r > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** Compact Indian units: ₹45,200 · ₹3.21 L · ₹1.84 Cr */
export function rupeesShort(paise: number | null | undefined): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const r = paise / 100;
  const abs = Math.abs(r);
  const sign = r < 0 ? "−" : "";
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 2)} L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3, 1)}K`;
  return `${sign}₹${inr.format(abs)}`;
}

/** Axis ticks: 0 · 50K · 2L · 1.5Cr (no currency symbol) */
export function compactAxis(paise: number): string {
  const abs = Math.abs(paise / 100);
  if (abs >= 1e7) return `${trim(abs / 1e7, 1)}Cr`;
  if (abs >= 1e5) return `${trim(abs / 1e5, 1)}L`;
  if (abs >= 1e3) return `${trim(abs / 1e3, 0)}K`;
  return `${Math.round(abs)}`;
}

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(digits).replace(/\.0$/, "")}%`;
}

export function ratioPct(part: number, whole: number): number | null {
  if (!whole) return null;
  return (100 * part) / whole;
}

export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return inr.format(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** '2026-10-11' -> '11 Oct 2026' (no timezone shifts: parses the date parts directly) */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  return dt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

/** '2026-10' -> 'October 2026' */
export function monthLabel(ym: string, long = true): string {
  const [y, m] = ym.split("-").map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** Months (YYYY-MM) between two ISO dates inclusive */
export function monthsBetween(startIso: string, endIso: string): string[] {
  const [sy, sm] = startIso.split("-").map(Number);
  const [ey, em] = endIso.split("-").map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** Today's date (YYYY-MM-DD) in India, regardless of server timezone */
export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export const MODE_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

/** Rupees in words, Indian system: 12,345 -> "Twelve Thousand Three Hundred Forty Five Rupees Only" */
export function rupeesInWords(paise: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n: number) => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`);
  const three = (n: number) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return [h ? `${ones[h]} Hundred` : "", r ? two(r) : ""].filter(Boolean).join(" ");
  };
  const abs = Math.abs(paise);
  let r = Math.floor(abs / 100);
  const p = abs % 100;
  if (r === 0 && p === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(r / 1e7);
  r %= 1e7;
  const lakh = Math.floor(r / 1e5);
  r %= 1e5;
  const thousand = Math.floor(r / 1e3);
  r %= 1e3;
  if (crore) parts.push(`${crore >= 100 ? three(crore) : two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (r) parts.push(three(r));
  let words = parts.join(" ");
  words = words ? `${words} Rupees` : "";
  if (p) words = `${words}${words ? " and " : ""}${two(p)} Paise`;
  return `${words} Only`;
}

/** Parse a rupee string typed by a user ("12,500.50") to paise. Returns null if invalid. */
export function parseRupees(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}
