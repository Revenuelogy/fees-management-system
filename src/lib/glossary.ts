// The money words used on every page, card, column, tooltip, export and printout. Each one says what it is when
// read on its own: "this year", "previous years" or "incl. previous years" is part of the name. `short` is for tight
// spaces (a column, a tile) where the rest of the screen already says which year. Not used anywhere: Pending,
// Overdue, Gap, Missing, Arrears, Old dues, Old balance, To recover, Balance (alone).
// The figures behind them come from SQL (fee_position(), student_balances() and the functions built on them).

export const MONEY = {
  total_fee: { label: "Total fees this year", short: "Total fees", hint: "What students must pay for this year, after concessions" },
  received: { label: "Received this year", short: "Received", hint: "Money received against this year's fees" },
  balance: { label: "Remaining this year", short: "Remaining", hint: "This year's fees not received yet (due till today + due later)" },
  due_now: { label: "Due till today", short: "Due till today", hint: "This year's installments whose due date has passed and are not paid" },
  due_later: { label: "Due later", short: "Due later", hint: "This year's installments whose due date has not come yet" },
  old_balance: { label: "Previous years' dues", short: "Previous years", hint: "Fees of previous years still unpaid" },
  old_balance_received: { label: "Received for previous years", short: "Received (prev. years)", hint: "Previous years' dues paid during this year" },
  total_fee_all: {
    label: "Total fees incl. previous years",
    short: "Total incl. previous",
    hint: "This year's fees plus what was left unpaid from previous years when this year started",
  },
  received_all: { label: "Received incl. previous years", short: "Received incl. previous", hint: "Received this year + received for previous years" },
  balance_all: { label: "Remaining incl. previous years", short: "Remaining incl. previous", hint: "Remaining this year + previous years' dues" },
  to_recover: { label: "Total due incl. previous years", short: "Total due", hint: "Due till today + previous years' dues" },
  advance: { label: "Paid in advance", short: "Paid in advance", hint: "Money paid before any fee was due for it; it is used as fees fall due" },
  days_since_payment: { label: "Days since last payment", short: "Days since payment", hint: "Days since the family last paid anything" },
} as const;

export type MoneyWord = keyof typeof MONEY;

/** "Received" etc. with its one-line meaning, for an ⓘ or a title attribute. */
export function moneyHint(word: MoneyWord) {
  return `${MONEY[word].label}: ${MONEY[word].hint}.`;
}

// Imports keep a previous year's unpaid total as one installment with a name like "Balance brought forward".
const CARRIED_NAMES = /^(balance brought forward|brought forward|previous (dues|balance)|old (dues|balance)|arrears)$/i;

/** An installment's name as shown (a carried-forward placeholder reads "Previous years' dues"). */
export function installmentName(name: string | null | undefined): string {
  if (!name) return "";
  return CARRIED_NAMES.test(name.trim()) ? MONEY.old_balance.label : name;
}

/** "Previous year (2025-26)", or "Previous year (2025-26) · Q3" when it is a real installment of that year. */
export function oldBalanceLabel(session: string | null | undefined, installment?: string | null): string {
  const base = session ? `Previous year (${session})` : MONEY.old_balance.label;
  return installment && !CARRIED_NAMES.test(installment.trim()) ? `${base} · ${installment}` : base;
}
