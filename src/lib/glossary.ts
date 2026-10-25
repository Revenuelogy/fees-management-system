// The money words used on every page, card, column, tooltip, export and printout (VPS Fees glossary). Nothing
// else: not Pending, Overdue, Gap, Missing, Still to come, Still owes, Behind, Old dues, Arrears or Silent.
// The figures behind them come from SQL (student_balances and the functions built on it).

export const MONEY = {
  total_fee: { label: "Total fee", hint: "What all students must pay this year" },
  received: { label: "Received", hint: "Money that has come in for this year's fees" },
  due_now: { label: "Due now", hint: "Due date has passed and it is not paid" },
  due_later: { label: "Due later", hint: "Installments whose due date has not come yet" },
  balance: { label: "Balance", hint: "Everything still to receive this year (Due now + Due later)" },
  old_balance: { label: "Old balance", hint: "Left unpaid from earlier years" },
  to_recover: { label: "To recover now", hint: "Due now + Old balance" },
  old_balance_received: { label: "Old balance received", hint: "Old balance paid during this year" },
  advance: { label: "Paid in advance", hint: "Money paid before any fee was due for it; it is used as fees fall due" },
  days_since_payment: { label: "Days since last payment", hint: "Days since the family last paid anything" },
} as const;

export type MoneyWord = keyof typeof MONEY;

/** "Received" etc. with its one-line meaning, for an ⓘ or a title attribute. */
export function moneyHint(word: MoneyWord) {
  return `${MONEY[word].label}: ${MONEY[word].hint}.`;
}

// Imports keep an earlier year's unpaid total as one installment with a name like "Balance brought forward".
const CARRIED_NAMES = /^(balance brought forward|brought forward|previous (dues|balance)|old (dues|balance)|arrears)$/i;

/** An installment's name as shown (a carried-forward placeholder reads "Old balance"). */
export function installmentName(name: string | null | undefined): string {
  if (!name) return "";
  return CARRIED_NAMES.test(name.trim()) ? MONEY.old_balance.label : name;
}

/** "Old balance (2025-26)", or "Old balance (2025-26) · Q3" when it is a real installment of that year. */
export function oldBalanceLabel(session: string | null | undefined, installment?: string | null): string {
  const base = `${MONEY.old_balance.label} (${session ?? "earlier year"})`;
  return installment && !CARRIED_NAMES.test(installment.trim()) ? `${base} · ${installment}` : base;
}
