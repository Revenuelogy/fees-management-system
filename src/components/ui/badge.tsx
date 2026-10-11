import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-ink-2",
  accent: "bg-accent-soft text-accent-strong",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warning-soft text-ink",
  serious: "bg-serious-soft text-ink",
  critical: "bg-critical-soft text-critical-ink",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[12px] font-medium leading-4", tones[tone], className)}
    >
      {children}
    </span>
  );
}
