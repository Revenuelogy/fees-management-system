import { AlertTriangle, CheckCircle2, CircleDashed, CircleSlash, Clock, History } from "lucide-react";
import type { FeeStatus } from "@/lib/types";
import { cn } from "@/lib/cn";

export const FEE_STATUS: Record<FeeStatus, { label: string; hint: string }> = {
  paid_up: { label: "Paid up", hint: "Nothing due to date" },
  partial: { label: "Partial", hint: "Paid something but behind on dues to date" },
  not_paying: { label: "Not paying", hint: "Nothing paid against this session's fees" },
  arrears_only: { label: "Arrears only", hint: "This session cleared, old dues remain" },
  free: { label: "Concession / free", hint: "Expected is zero" },
  no_plan: { label: "No fee plan", hint: "Enrolled but no charges generated" },
};

const STYLE: Record<FeeStatus, { cls: string; icon: React.ElementType; dot: string }> = {
  paid_up: { cls: "bg-good-soft text-good-ink", icon: CheckCircle2, dot: "bg-good" },
  partial: { cls: "bg-warning-soft text-ink", icon: Clock, dot: "bg-warning" },
  not_paying: { cls: "bg-critical-soft text-critical-ink", icon: AlertTriangle, dot: "bg-critical" },
  arrears_only: { cls: "bg-serious-soft text-ink", icon: History, dot: "bg-serious" },
  free: { cls: "bg-surface-3 text-ink-2", icon: CircleSlash, dot: "bg-line-strong" },
  no_plan: { cls: "bg-surface-3 text-ink-2", icon: CircleDashed, dot: "bg-line-strong" },
};

export function FeeStatusBadge({ status, className }: { status: FeeStatus | null | undefined; className?: string }) {
  if (!status) return null;
  const s = STYLE[status];
  const Icon = s.icon;
  return (
    <span
      title={FEE_STATUS[status].hint}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-4", s.cls, className)}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {FEE_STATUS[status].label}
    </span>
  );
}

export function statusDot(status: FeeStatus) {
  return STYLE[status].dot;
}

const PAY_STATUS = {
  paid: { label: "Paid", cls: "bg-good-soft text-good-ink", icon: CheckCircle2 },
  partial: { label: "Partial", cls: "bg-warning-soft text-ink", icon: Clock },
  not_paid: { label: "Not paid", cls: "bg-critical-soft text-critical-ink", icon: AlertTriangle },
  nothing_due: { label: "Nothing due", cls: "bg-surface-3 text-ink-2", icon: CircleSlash },
} as const;

export function PayStatusBadge({ status }: { status: keyof typeof PAY_STATUS }) {
  const s = PAY_STATUS[status];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-4", s.cls)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {s.label}
    </span>
  );
}

export const PAY_STATUS_LABELS = Object.fromEntries(Object.entries(PAY_STATUS).map(([k, v]) => [k, v.label]));
