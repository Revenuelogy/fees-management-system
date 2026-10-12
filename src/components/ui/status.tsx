import type { FeeStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const FEE_STATUS: Record<FeeStatus, { label: string; hint: string }> = {
  paid_up: { label: "Paid up", hint: "Nothing due to date" },
  partial: { label: "Partial", hint: "Paid something but behind on dues to date" },
  not_paying: { label: "Not paying", hint: "Nothing paid against this session's fees" },
  arrears_only: { label: "Old dues", hint: "This session cleared, old dues remain" },
  free: { label: "Free", hint: "Concession / free seat: expected is zero" },
  no_plan: { label: "No fee plan", hint: "Enrolled but no charges generated" },
};

/** Fee status colour tokens: dot, tinted background, text. */
export const STATUS_STYLE: Record<FeeStatus, { dot: string; pill: string; bar: string }> = {
  paid_up: { dot: "bg-good", pill: "bg-good-soft text-good-ink", bar: "bg-good" },
  partial: { dot: "bg-warning", pill: "bg-warning-soft text-warning-ink", bar: "bg-warning" },
  arrears_only: { dot: "bg-serious", pill: "bg-serious-soft text-serious-ink", bar: "bg-serious" },
  not_paying: { dot: "bg-critical", pill: "bg-critical-soft text-critical-ink", bar: "bg-critical" },
  free: { dot: "bg-tile-gray", pill: "bg-fill text-ink-2", bar: "bg-tile-gray" },
  no_plan: { dot: "bg-tile-gray", pill: "bg-fill text-ink-2", bar: "bg-surface-3" },
};

export function FeeStatusBadge({ status, className }: { status: FeeStatus | null | undefined; className?: string }) {
  if (!status) return null;
  const s = STATUS_STYLE[status];
  return (
    <span
      title={FEE_STATUS[status].hint}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-[3px] pl-2 pr-2.5 text-caption font-semibold leading-4", s.pill, className)}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {FEE_STATUS[status].label}
    </span>
  );
}

export function statusDot(status: FeeStatus) {
  return STATUS_STYLE[status].dot;
}

const PAY_STATUS = {
  paid: { label: "Paid", pill: "bg-good-soft text-good-ink", dot: "bg-good" },
  partial: { label: "Partial", pill: "bg-warning-soft text-warning-ink", dot: "bg-warning" },
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
