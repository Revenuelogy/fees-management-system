import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { ClassSummaryRow } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Legend, StackedBar } from "@/components/ui/bars";
import { Ring } from "@/components/ui/ring";
import { FEE_STATUS } from "@/components/ui/status";
import { NoSession } from "@/components/no-session";

export const metadata = { title: "Classes" };

const STATUS: { key: keyof ClassSummaryRow["status"]; cls: string; label: string }[] = [
  { key: "paid_up", cls: "bg-good", label: FEE_STATUS.paid_up.label },
  { key: "partial", cls: "bg-warning", label: FEE_STATUS.partial.label },
  { key: "arrears_only", cls: "bg-serious", label: FEE_STATUS.arrears_only.label },
  { key: "not_paying", cls: "bg-critical", label: FEE_STATUS.not_paying.label },
  { key: "free", cls: "bg-tile-gray", label: FEE_STATUS.free.label },
];

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const arrears = flag(sp.arrears, false);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("class_summary", { p_session: session.id, p_include_arrears: arrears });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ClassSummaryRow[];
  const tot = rows.reduce((a, r) => ({ expected: a.expected + r.expected, received: a.received + r.received, pending: a.pending + r.pending }), { expected: 0, received: 0, pending: 0 });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Classes"
        description={`${session.name} · ${rupeesShort(tot.pending)} pending across ${rows.filter((r) => r.class_id).length} classes`}
        info="Ring = share of the class's fees collected. Bar = students by fee status."
      >
        <Segmented
          options={[
            { label: "This session", href: "/classes", active: !arrears },
            { label: "Including old dues", href: "/classes?arrears=1", active: arrears },
          ]}
        />
        <Legend className="ml-auto" items={STATUS.slice(0, 4).map((s) => ({ label: s.label, className: s.cls }))} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rows.map((r, i) => {
          const href = r.class_id ? withParams(`/classes/${r.class_id}`, { arrears: arrears || undefined }) : "/pending?arrears=1&unassigned=1";
          return (
            <Link
              key={r.class_id ?? "none"}
              href={href}
              className="animate-rise group rounded-[var(--radius-card)] bg-surface p-5 shadow-card transition-transform duration-200 hover:-translate-y-0.5"
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              title={`${r.class_name}: ${rupees(r.received)} of ${rupees(r.expected)} collected, ${rupees(r.pending)} pending`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-headline font-semibold text-ink group-hover:text-accent">{r.class_name}</p>
                  <p className="text-footnote text-ink-2">{r.students} students</p>
                </div>
                <Ring value={r.collection_pct} size={58} stroke={7}>
                  <span className="text-caption font-semibold tabular">{Math.round(r.collection_pct ?? 0)}%</span>
                </Ring>
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <p className="text-caption text-muted">Pending</p>
                  <p className="figure text-title2 text-ink">{rupeesShort(r.pending)}</p>
                </div>
                <div className="text-right">
                  <p className="text-caption text-muted">Overdue</p>
                  <p className={`text-headline font-semibold tabular ${r.overdue > 0 ? "text-critical-ink" : "text-good-ink"}`}>{rupeesShort(r.overdue)}</p>
                </div>
              </div>
              <div className="mt-4">
                <StackedBar
                  height="h-2"
                  segments={STATUS.map((s) => ({ value: r.status[s.key] ?? 0, className: s.cls, label: s.label, display: String(r.status[s.key] ?? 0) }))}
                />
                <p className="mt-2 text-caption text-muted">
                  {r.status.paid_up} paid up · {r.status.not_paying + r.status.partial} behind · {pct(r.share_of_pending, 0)} of school pending
                </p>
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-center text-caption text-muted">
        School: {rupeesShort(tot.received)} of {rupeesShort(tot.expected)} collected ({pct(ratioPct(tot.received, tot.expected), 0)})
      </p>
    </div>
  );
}
