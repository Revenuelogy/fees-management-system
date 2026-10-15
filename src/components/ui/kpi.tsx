import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { InfoTip } from "@/components/ui/info-tip";

export type TileColor = "blue" | "green" | "orange" | "red" | "indigo" | "teal" | "gray";

const TILE: Record<TileColor, string> = {
  blue: "bg-tile-blue",
  green: "bg-tile-green",
  orange: "bg-tile-orange",
  red: "bg-tile-red",
  indigo: "bg-tile-indigo",
  teal: "bg-tile-teal",
  gray: "bg-tile-gray",
};

const METER: Record<TileColor, { fill: string; track: string }> = {
  blue: { fill: "bg-series-1", track: "bg-accent-soft" },
  green: { fill: "bg-good", track: "bg-good-soft" },
  orange: { fill: "bg-series-2", track: "bg-serious-soft" },
  red: { fill: "bg-critical", track: "bg-critical-soft" },
  indigo: { fill: "bg-tile-indigo", track: "bg-fill" },
  teal: { fill: "bg-series-3", track: "bg-fill" },
  gray: { fill: "bg-tile-gray", track: "bg-fill" },
};

/** iOS-Settings style rounded icon tile. */
export function IconTile({ icon: Icon, color = "blue", size = "md" }: { icon: React.ElementType; color?: TileColor; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "size-6 rounded-[7px]", md: "size-8 rounded-[9px]", lg: "size-10 rounded-[11px]" }[size];
  const i = { sm: "size-3.5", md: "size-[18px]", lg: "size-5" }[size];
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center text-white", s, TILE[color])} aria-hidden>
      <Icon className={i} strokeWidth={2.2} />
    </span>
  );
}

/**
 * Stat tile: icon, short label, one big number, optional meter and one short line.
 */
export function Kpi({
  label,
  value,
  sub,
  href,
  tone = "default",
  meter,
  hero,
  icon,
  color = "blue",
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: "default" | "good" | "critical";
  /** 0-100 fill shown as a thin meter under the value */
  meter?: number | null;
  hero?: boolean;
  icon?: React.ElementType;
  color?: TileColor;
  hint?: React.ReactNode;
  className?: string;
}) {
  const m = METER[color];
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          {icon && <IconTile icon={icon} color={color} size="sm" />}
          <span className="truncate text-subhead font-medium text-ink-2">{label}</span>
          {hint && <InfoTip align="start">{hint}</InfoTip>}
        </span>
        {href && <ChevronRight className="no-print size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />}
      </div>
      <div
        className={cn(
          "figure mt-3",
          hero ? "text-[40px] leading-none" : "text-[28px] leading-none",
          tone === "good" ? "text-good-ink" : tone === "critical" ? "text-critical-ink" : "text-ink",
        )}
      >
        {value}
      </div>
      {meter !== undefined && meter !== null && (
        <div className={cn("mt-3.5 h-[6px] overflow-hidden rounded-full", m.track)} aria-hidden>
          <div className={cn("h-full rounded-full", m.fill)} style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {sub && <div className="mt-2.5 text-footnote leading-snug text-ink-2">{sub}</div>}
    </>
  );
  const cls = cn("group block rounded-[var(--radius-card)] bg-surface p-5 shadow-card", className);
  return href ? (
    <Link href={href} className={cn(cls, "transition-transform duration-200 hover:-translate-y-0.5")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  const map = {
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  } as const;
  return <div className={cn("grid grid-cols-1 gap-4 min-[520px]:grid-cols-2", map[cols])}>{children}</div>;
}
