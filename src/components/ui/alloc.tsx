import type { AllocationLine } from "@/lib/types";
import { rupees } from "@/lib/format";
import { cn } from "@/lib/cn";

const KIND: Record<AllocationLine["kind"], { label: string; cls: string }> = {
  current: { label: "Current year", cls: "bg-series-1" },
  arrears: { label: "Previous dues", cls: "bg-series-2" },
  advance: { label: "Advance", cls: "bg-series-3" },
};

export function allocText(a: AllocationLine): string {
  if (!a.installment) return `Advance ${rupees(a.amount)}`;
  return `${a.session} · Inst ${a.installment_no} · ${a.fee_head} ${rupees(a.amount)}`;
}

/** Compact "what it paid for" lines: a colour key per kind, text in ink. */
export function AllocLines({ lines, compact = false }: { lines: AllocationLine[]; compact?: boolean }) {
  if (!lines || lines.length === 0) return <span className="text-muted">—</span>;
  // group by session + installment + kind for a compact read
  const groups = new Map<string, { kind: AllocationLine["kind"]; title: string; amount: number; heads: string[]; inferred: boolean }>();
  for (const a of lines) {
    const key = `${a.kind}|${a.session}|${a.installment_no}`;
    const title = a.installment ? `${a.session} · Inst ${a.installment_no}` : "Advance (no dues yet)";
    const g = groups.get(key) ?? { kind: a.kind, title, amount: 0, heads: [], inferred: false };
    g.amount += a.amount;
    if (a.fee_head && !g.heads.includes(a.fee_head)) g.heads.push(a.fee_head);
    g.inferred = g.inferred || !!a.is_inferred;
    groups.set(key, g);
  }
  return (
    <ul className={cn("space-y-0.5", compact ? "text-[12px]" : "text-[12.5px]")}>
      {[...groups.values()].map((g, i) => (
        <li key={i} className="flex items-start gap-1.5 leading-snug">
          <span className={cn("mt-[5px] size-2 shrink-0 rounded-[2px]", KIND[g.kind].cls)} aria-hidden />
          <span>
            <span className="text-ink">{g.title}</span>
            <span className="text-muted"> · {KIND[g.kind].label}</span>{" "}
            <span className="font-medium tabular text-ink">{rupees(g.amount)}</span>
            {!compact && g.heads.length > 0 && <span className="block text-muted">{g.heads.join(", ")}</span>}
            {g.inferred && <span className="text-muted" title="Imported receipt without a fee head; split by the default rule"> · inferred</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export const KIND_LEGEND = [
  { label: "Current year fees", className: "bg-series-1" },
  { label: "Previous dues", className: "bg-series-2" },
  { label: "Advance", className: "bg-series-3" },
];
