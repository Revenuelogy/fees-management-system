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
 * Horizontal bar list in plain HTML (labels never clip). One series, one colour.
 * Bars grow from a single baseline with a rounded data-end.
 */
export function BarList({
  rows,
  color = "bg-series-1",
  labelWidth = "w-28 sm:w-36",
  max,
}: {
  rows: BarRow[];
  color?: string;
  labelWidth?: string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-1">
      {rows.map((r, i) => {
        const w = Math.max(0, Math.min(100, (100 * Math.max(0, r.value)) / top));
        const inner = (
          <>
            <span className={cn("shrink-0 truncate text-[13px] text-ink", labelWidth)} title={r.label}>
              {r.label}
            </span>
            <span className="relative flex h-6 flex-1 items-center">
              <span
                className={cn("block h-3.5 rounded-r-[4px]", color, w === 0 && "hidden")}
                style={{ width: `${w}%` }}
                aria-hidden
              />
              <span className="ml-2 whitespace-nowrap text-[12.5px] tabular text-ink-2">
                <span className="font-medium text-ink">{r.display}</span>
                {r.sub && <span className="text-muted"> · {r.sub}</span>}
              </span>
            </span>
          </>
        );
        return (
          <li key={i} title={r.title ?? `${r.label}: ${r.display}${r.sub ? " · " + r.sub : ""}`}>
            {r.href ? (
              <Link href={r.href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-0.5 hover:bg-surface-2">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-0.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export type Segment = { value: number; className: string; label: string; display?: string };

/** One stacked horizontal bar with 2px surface gaps between segments. */
export function StackedBar({ segments, height = "h-3.5", total }: { segments: Segment[]; height?: string; total?: number }) {
  const sum = total ?? segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  if (sum <= 0) return <div className={cn("w-full rounded-[4px] bg-series-track", height)} />;
  const visible = segments.filter((s) => s.value > 0);
  return (
    <div className={cn("flex w-full gap-[2px] overflow-hidden rounded-[4px]", height)} role="img"
      aria-label={visible.map((s) => `${s.label} ${s.display ?? s.value}`).join(", ")}>
      {visible.map((s, i) => (
        <div
          key={i}
          className={cn("h-full", s.className)}
          style={{ width: `${(100 * s.value) / sum}%` }}
          title={`${s.label}: ${s.display ?? s.value}`}
        />
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; className: string; shape?: "rect" | "line" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cn(it.shape === "line" ? "h-0.5 w-3.5 rounded" : "size-2.5 rounded-[3px]", it.className)} aria-hidden />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Thin progress meter: blue on a lighter blue track. */
export function Meter({ value, className }: { value: number | null | undefined; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-accent-soft", className)} aria-hidden>
      <div className="h-full rounded-full bg-accent" style={{ width: `${v}%` }} />
    </div>
  );
}
