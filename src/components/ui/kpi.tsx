import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";

export function Kpi({
  label,
  value,
  sub,
  href,
  tone = "default",
  meter,
  hero,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: "default" | "good" | "critical";
  /** 0-100 fill shown as a thin meter under the value */
  meter?: number | null;
  hero?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        {href && <ArrowUpRight className="no-print size-4 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />}
      </div>
      <div
        className={cn(
          "mt-1 font-semibold tracking-tight",
          hero ? "text-3xl sm:text-[34px]" : "text-2xl",
          tone === "good" && "text-good-ink",
          tone === "critical" && "text-critical-ink",
        )}
      >
        {value}
      </div>
      {meter !== undefined && meter !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent-soft" aria-hidden>
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{sub}</div>}
    </>
  );
  const cls = "group block rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-line-strong")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiGrid({ children, cols = 5 }: { children: React.ReactNode; cols?: 3 | 4 | 5 | 6 }) {
  const map = {
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  } as const;
  return <div className={cn("grid grid-cols-1 gap-3 min-[480px]:grid-cols-2", map[cols])}>{children}</div>;
}
