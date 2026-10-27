// The period picked on Home, the recovery dashboard and the call analytics
// (URL: ?period=today|yesterday|7d|30d|year|custom&from&to).

import { addDays, isIsoDate } from "@/lib/dates";
import { fmtDate } from "@/lib/format";
import { withParams } from "@/components/ui/segmented";

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
] as const;

/** The short choice on Home and Calls. */
export const QUICK_PERIODS = PERIODS.filter((p) => p.key === "today" || p.key === "yesterday" || p.key === "7d" || p.key === "30d");

export type PeriodKey = (typeof PERIODS)[number]["key"];
type QuickKey = "today" | "yesterday" | "7d" | "30d";

export type Period = { key: PeriodKey; from: string; to: string; label: string; before: string };

function quick(key: QuickKey, today: string): Period {
  switch (key) {
    case "today":
      return { key, from: today, to: today, label: "Today", before: "yesterday" };
    case "yesterday":
      return { key, from: addDays(today, -1), to: addDays(today, -1), label: "Yesterday", before: "the day before" };
    case "30d":
      return { key, from: addDays(today, -29), to: today, label: "Last 30 days", before: "the 30 days before" };
    default:
      return { key: "7d", from: addDays(today, -6), to: today, label: "Last 7 days", before: "the 7 days before" };
  }
}

/**
 * Dates of a period ending today (the school year starts at `yearStart`). A custom range needs both dates; anything
 * unknown falls back to `fallback`.
 */
export function resolvePeriod(
  key: string | undefined,
  from: string | undefined,
  to: string | undefined,
  today: string,
  yearStart: string | null,
  fallback: QuickKey = "7d",
): Period {
  switch (key) {
    case "today":
    case "yesterday":
    case "7d":
    case "30d":
      return quick(key, today);
    case "year":
      if (yearStart && yearStart <= today) return { key, from: yearStart, to: today, label: "This school year", before: "the same number of days before" };
      break;
    case "custom":
      if (isIsoDate(from) && isIsoDate(to) && from <= to) {
        return { key, from, to, label: from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`, before: "the same number of days before" };
      }
      break;
  }
  return quick(fallback, today);
}

/** The Payments register for the same days. */
export function paymentsHref(p: Period) {
  if (p.key === "today" || p.key === "yesterday") return withParams("/payments", { preset: p.key });
  return withParams("/payments", { from: p.from, to: p.to });
}
