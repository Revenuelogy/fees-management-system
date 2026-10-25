import type { FeeStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

/** Student status tags (the same on every page). The rules are fee_status in SQL; `hint` is the one-line meaning. */
export const FEE_STATUS: Record<FeeStatus, { label: string; hint: string }> = {
  paid_up: { label: "Paid up", hint: "Nothing due now and no old balance" },
  partial: { label: "Part paid", hint: "Some of this year's fees received, some due now" },
  not_paying: { label: "Nothing paid this year", hint: "Nothing received against this year's fees" },
  arrears_only: { label: "Old balance only", hint: "This year is clear; old balance from earlier years is left" },
  free: { label: "Free", hint: "Student has no fee" },
  no_plan: { label: "No fees assigned", hint: "Enrolled, but no fees assigned yet" },
};

/** Status tag colours: green paid up, blue part paid, red nothing paid, amber old balance, grey free. */
export const STATUS_STYLE: Record<FeeStatus, { dot: string; pill: string; bar: string }> = {
  paid_up: { dot: "bg-good", pill: "bg-good-soft text-good-ink", bar: "bg-good" },
  partial: { dot: "bg-series-1", pill: "bg-accent-soft text-accent", bar: "bg-series-1" },
  arrears_only: { dot: "bg-serious", pill: "bg-serious-soft text-serious-ink", bar: "bg-serious" },
  not_paying: { dot: "bg-critical", pill: "bg-critical-soft text-critical-ink", bar: "bg-critical" },
  free: { dot: "bg-tile-gray", pill: "bg-fill text-ink-2", bar: "bg-tile-gray" },
  no_plan: { dot: "bg-tile-gray", pill: "bg-fill text-ink-2", bar: "bg-surface-3" },
};

/** A status tag: text and colour, and its meaning on hover or tap (focusable, so a tap shows it on a phone). */
export function FeeStatusBadge({ status, className }: { status: FeeStatus | null | undefined; className?: string }) {
  if (!status) return null;
  const s = STATUS_STYLE[status];
  return (
    <span className="group/tag relative inline-flex align-middle">
      <span
        tabIndex={0}
        title={FEE_STATUS[status].hint}
        className={cn(
          "inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pl-2 pr-2.5 text-caption font-semibold leading-4 outline-none focus-visible:ring-2 focus-visible:ring-accent",
          s.pill,
          className,
        )}
      >
        <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
        {FEE_STATUS[status].label}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-max max-w-[240px] rounded-xl bg-surface px-3 py-2 text-left text-footnote font-normal text-ink-2 shadow-pop group-focus-within/tag:block"
      >
        {FEE_STATUS[status].hint}
      </span>
    </span>
  );
}

export function statusDot(status: FeeStatus) {
  return STATUS_STYLE[status].dot;
}

const PAY_STATUS = {
  paid: { label: "Paid", pill: "bg-good-soft text-good-ink", dot: "bg-good" },
  partial: { label: "Part paid", pill: "bg-accent-soft text-accent", dot: "bg-series-1" },
  not_paid: { label: "Not paid", pill: "bg-critical-soft text-critical-ink", dot: "bg-critical" },
  nothing_due: { label: "Nothing due", pill: "bg-fill text-ink-2", dot: "bg-tile-gray" },
} as const;

export function PayStatusBadge({ status }: { status: keyof typeof PAY_STATUS }) {
  const s = PAY_STATUS[status];
  if (!s) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pl-2 pr-2.5 text-caption font-semibold leading-4", s.pill)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}

export const PAY_STATUS_LABELS = Object.fromEntries(Object.entries(PAY_STATUS).map(([k, v]) => [k, v.label]));
