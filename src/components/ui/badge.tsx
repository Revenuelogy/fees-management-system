import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "good" | "warning" | "serious" | "critical";

const tones: Record<Tone, string> = {
  neutral: "bg-fill text-ink-2",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good-ink",
  warning: "bg-warning-soft text-warning-ink",
  serious: "bg-serious-soft text-serious-ink",
  critical: "bg-critical-soft text-critical-ink",
};

/** Tinted pill. */
export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[2px] text-caption font-semibold leading-4", tones[tone], className)}
    >
      {children}
    </span>
  );
}
