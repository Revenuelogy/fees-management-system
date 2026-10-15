import Link from "next/link";
import { cn } from "@/lib/cn";

export type BarRow = {
  label: string;
  value: number;
  display: string;
  sub?: string;
  href?: string;
  title?: string;
};

/**
 * Screen-Time style bar list: label and value on one line, a soft rounded bar beneath.
 * One series, one colour; labels never clip.
 */
export function BarList({
  rows,
  color = "bg-series-1",
  max,
  compact = false,
}: {
  rows: BarRow[];
  color?: string;
  /** @deprecated kept for compatibility */
  labelWidth?: string;
  max?: number;
  compact?: boolean;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className={compact ? "space-y-2.5" : "space-y-3.5"}>
      {rows.map((r, i) => {
        const w = Math.max(0, Math.min(100, (100 * Math.max(0, r.value)) / top));
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-subhead text-ink">{r.label}</span>
              <span className="shrink-0 whitespace-nowrap text-subhead tabular">
                <span className="font-semibold text-ink">{r.display}</span>
                {r.sub && <span className="ml-1.5 text-footnote text-muted">{r.sub}</span>}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fill-2" aria-hidden>
              <div className={cn("h-full rounded-full transition-[width] duration-700", color)} style={{ width: `${w}%` }} />
            </div>
          </>
        );
        return (
          <li key={i} title={r.title ?? `${r.label}: ${r.display}${r.sub ? " · " + r.sub : ""}`}>
            {r.href ? (
              <Link href={r.href} className="-mx-2 block rounded-xl px-2 py-1 transition-colors hover:bg-fill-2">
                {inner}
              </Link>
            ) : (
              <div className="py-0.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type Segment = { value: number; className: string; label: string; display?: string };

/** One stacked bar with 2px surface gaps between rounded segments. */
export function StackedBar({ segments, height = "h-2.5", total }: { segments: Segment[]; height?: string; total?: number }) {
  const sum = total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (sum <= 0) return <div className={cn("w-full rounded-full bg-fill-2", height)} />;
  const visible = segments.filter((s) => s.value > 0);
  const shown = visible.reduce((a, s) => a + s.value, 0);
  return (
    <div
      className={cn("flex w-full gap-[2px] overflow-hidden rounded-full bg-fill-2", height)}
      role="img"
      aria-label={visible.map((s) => `${s.label} ${s.display ?? s.value}`).join(", ")}
    >
      {visible.map((s, i) => (
        <div key={i} className={cn("h-full first:rounded-l-full last:rounded-r-full", s.className)} style={{ width: `${(100 * s.value) / sum}%` }} title={`${s.label}: ${s.display ?? s.value}`} />
      ))}
      {shown < sum && <div className="h-full flex-1" />}
    </div>
  );
}

export function Legend({ items, className }: { items: { label: string; className: string; shape?: "rect" | "line"; value?: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-footnote text-ink-2", className)}>
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cn(it.shape === "line" ? "h-[3px] w-3.5 rounded-full" : "size-2 rounded-full", it.className)} aria-hidden />
          {it.label}
          {it.value && <span className="font-semibold text-ink tabular">{it.value}</span>}
        </span>
      ))}
    </div>
  );
}

/** Thin progress meter: blue on a lighter blue track. */
export function Meter({ value, className, color = "bg-series-1", track = "bg-accent-soft" }: { value: number | null | undefined; className?: string; color?: string; track?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("h-[6px] w-full overflow-hidden rounded-full", track, className)} aria-hidden>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
