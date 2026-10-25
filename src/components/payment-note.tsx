import { fmtDate, rupees } from "@/lib/format";

type Split = { amount: number; paid_on: string; current: number; arrears: number; advance: number };

/**
 * One plain sentence saying where a payment went, when it was not simply this year's fees, e.g. "Paid ₹18,800 on
 * 1 Aug 2026. It cleared last year's old balance. Nothing paid for 2026-27 yet." The split comes from SQL
 * (allocations by kind); this only words it.
 */
export function paymentNote(p: Split, ctx: { sessionName?: string | null; receivedThisYear?: number | null } = {}): string | null {
  if (p.amount <= 0 || (p.arrears <= 0 && p.advance <= 0)) return null;
  const year = ctx.sessionName ?? "this year";
  const parts: string[] = [];
  if (p.arrears > 0 && p.current <= 0 && p.advance <= 0) {
    parts.push(`Paid ${rupees(p.amount)} on ${fmtDate(p.paid_on)}. It cleared last year's old balance.`);
  } else {
    const went = [
      p.arrears > 0 ? `${rupees(p.arrears)} cleared last year's old balance` : null,
      p.current > 0 ? `${rupees(p.current)} went to ${year}` : null,
      p.advance > 0 ? `${rupees(p.advance)} was paid in advance` : null,
    ].filter(Boolean);
    parts.push(`Paid ${rupees(p.amount)} on ${fmtDate(p.paid_on)}: ${went.join(", ")}.`);
  }
  if (p.arrears > 0 && ctx.receivedThisYear === 0) parts.push(`Nothing paid for ${year} yet.`);
  return parts.join(" ");
}

/** The short form for a receipt list: "₹18,800 cleared old balance · ₹2,000 this year". */
export function paymentSplit(p: Split): string | null {
  if (p.amount <= 0 || (p.arrears <= 0 && p.advance <= 0)) return null;
  return [
    p.arrears > 0 ? `${rupees(p.arrears)} cleared old balance` : null,
    p.current > 0 ? `${rupees(p.current)} this year` : null,
    p.advance > 0 ? `${rupees(p.advance)} paid in advance` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
