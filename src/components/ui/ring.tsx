import { cn } from "@/lib/cn";

/**
 * Progress ring (Apple Activity style). value 0–100.
 * The track is a lighter step of the same hue so state reads around the whole ring.
 */
export function Ring({
  value,
  size = 120,
  stroke = 12,
  color = "var(--series-1)",
  track,
  children,
  className,
  label,
}: {
  value: number | null | undefined;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} role="img" aria-label={label ?? `${Math.round(v)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? "var(--fill)"} strokeWidth={stroke} />
        {v > 0 && <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * v) / 100} ${c}`}
          style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.2,0.7,0.2,1)" }}
        />}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

/** Small donut made of several segments (part-to-whole, ≤ 6 segments). */
export function Donut({
  segments,
  size = 148,
  stroke = 18,
  children,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  // Start of each segment along the circle = sum of the segments before it.
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((a, s) => a + (c * Math.max(0, s.value)) / total, 0));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img"
      aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke} />
        {segments.map((s, i) => {
          if (s.value <= 0) return null;
          const len = Math.max(0, (c * s.value) / total - gap);
          return (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${c}`} strokeDashoffset={-starts[i]}>
              <title>{`${s.label}: ${s.value}`}</title>
            </circle>
          );
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}
