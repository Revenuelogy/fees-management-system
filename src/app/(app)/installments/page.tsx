import Link from "next/link";
import { Target } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { getActiveSession } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { CollectionTarget, InstallmentRow, TargetProgress } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Badge } from "@/components/ui/badge";
import { Legend, Meter, StackedBar } from "@/components/ui/bars";
import { Empty } from "@/components/ui/empty";
import { NoSession } from "@/components/no-session";
import { TargetForm, DeleteTargetButton } from "./target-form";

export const metadata = { title: "Installment analysis" };

const STATUS_TONE = { upcoming: "neutral", open: "accent", closed: "neutral" } as const;
const STATUS_LABEL = { upcoming: "Upcoming", open: "Open", closed: "Closed" } as const;

export default async function InstallmentsPage() {
  const viewer = await requireStaff();
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const supabase = await createClient();
  const [{ data, error }, { data: targetsData }] = await Promise.all([
    supabase.rpc("installments_overview", { p_session: session.id }),
    supabase.from("collection_targets").select("*").eq("session_id", session.id).order("target_date"),
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as InstallmentRow[];
  const targets = (targetsData ?? []) as CollectionTarget[];
  const progress = await Promise.all(
    targets.map(async (t) => {
      const { data: p } = await supabase.rpc("target_progress", { p_target: t.id });
      return p as TargetProgress | null;
    }),
  );

  const tot = rows.reduce(
    (a, r) => ({ expected: a.expected + r.expected, received: a.received + r.received, on_time: a.on_time + r.on_time, late: a.late + r.late, gap: a.gap + r.gap }),
    { expected: 0, received: 0, on_time: 0, late: 0, gap: 0 },
  );
  const dueRows = rows.filter((r) => r.status !== "upcoming");
  const dueExp = dueRows.reduce((a, r) => a + r.expected, 0);
  const dueGap = dueRows.reduce((a, r) => a + r.gap, 0);

  return (
    <>
      <PageHeader
        title="Installment analysis"
        description={`Session ${session.name}: did each installment bring in what the fee plan said, and who caused the shortfall?`}
        crumbs={[{ label: session.name, href: "/" }, { label: "Installments" }]}
      />

      {rows.length === 0 ? (
        <Card>
          <Empty title="No installments in this session">
            Add installments under <Link className="text-accent underline" href="/setup/sessions">Setup → Sessions</Link>.
          </Empty>
        </Card>
      ) : (
        <>
          <KpiGrid cols={4}>
            <Kpi label="Planned for the year" value={rupeesShort(tot.expected)} sub={`${rows.length} installments after concessions`} />
            <Kpi label="Received against installments" value={rupeesShort(tot.received)} meter={ratioPct(tot.received, tot.expected)} sub={`${pct(ratioPct(tot.received, tot.expected))} of the year's plan`} />
            <Kpi
              label="Gap in installments already due"
              value={rupeesShort(dueGap)}
              tone={dueGap > 0 ? "critical" : "good"}
              sub={`${pct(ratioPct(dueExp - dueGap, dueExp))} of ${rupeesShort(dueExp)} collected`}
            />
            <Kpi label="Paid on time" value={pct(ratioPct(tot.on_time, tot.received))} sub={`${rupeesShort(tot.on_time)} on or before due date · ${rupeesShort(tot.late)} late`} />
          </KpiGrid>

          <Card className="mt-4" title="Installment summary" description="Received = money allocated to the installment, whenever it was paid. Click an installment for the full gap analysis.">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-[13.5px]">
                <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Installment</th>
                    <th className="px-3 py-2 font-medium">Due date</th>
                    <th className="px-3 py-2 text-right font-medium">Expected</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Gap</th>
                    <th className="px-3 py-2 font-medium">Collection</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Students cleared</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-line hover:bg-surface-2/60">
                      <td className="px-3 py-2.5">
                        <Link href={`/installments/${r.number}`} className="font-medium text-ink hover:text-accent hover:underline">
                          {r.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{fmtDate(r.due_date)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">{rupees(r.expected)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">{rupees(r.received)}</td>
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right ${r.gap > 0 && r.status !== "upcoming" ? "font-medium text-critical-ink" : ""}`}>{rupees(r.gap)}</td>
                      <td className="min-w-[140px] px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Meter value={r.collection_pct} className="w-20" />
                          <span>{pct(r.collection_pct)}</span>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right md:table-cell">
                        {r.students_cleared} / {r.students}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="tabular">
                  <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                    <td className="px-3 py-2" colSpan={2}>
                      Year
                    </td>
                    <td className="px-3 py-2 text-right">{rupees(tot.expected)}</td>
                    <td className="px-3 py-2 text-right">{rupees(tot.received)}</td>
                    <td className="px-3 py-2 text-right">{rupees(tot.gap)}</td>
                    <td className="px-3 py-2">{pct(ratioPct(tot.received, tot.expected))}</td>
                    <td className="hidden md:table-cell" />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card
            className="mt-4"
            title="On time, late and missing"
            description="For each installment: money received by the due date, money received after it, and what is still missing. A growing grey part means the shortfall is being carried forward."
          >
            <Legend
              items={[
                { label: "Received on time", className: "bg-series-1" },
                { label: "Received late", className: "bg-series-2" },
                { label: "Still missing", className: "bg-series-track" },
              ]}
            />
            <ul className="mt-4 space-y-4">
              {rows.map((r) => (
                <li key={r.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                    <Link href={`/installments/${r.number}`} className="font-medium text-ink hover:underline">
                      {r.name} <span className="font-normal text-muted">· due {fmtDate(r.due_date)}</span>
                    </Link>
                    <span className="tabular text-ink-2">
                      {rupeesShort(r.on_time)} on time · {rupeesShort(r.late)} late · <span className="text-ink">{rupeesShort(r.gap)} missing</span>
                    </span>
                  </div>
                  <StackedBar
                    height="h-5"
                    total={r.expected}
                    segments={[
                      { value: r.on_time, className: "bg-series-1", label: "On time", display: rupees(r.on_time) },
                      { value: r.late, className: "bg-series-2", label: "Late", display: rupees(r.late) },
                      { value: r.gap, className: "bg-series-track", label: "Missing", display: rupees(r.gap) },
                    ]}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <Card
        className="mt-4"
        title="Collection targets"
        description="Set a goal such as “90% of fees due by 31 December”. The tracker shows the rupee gap and the smallest list of students whose payment would close it."
      >
        {targets.length === 0 && <p className="mb-4 text-sm text-ink-2">No targets yet.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {targets.map((t, i) => {
            const p = progress[i];
            if (!p) return null;
            return (
              <div key={t.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-medium text-ink">
                      <Target className="size-4 text-muted" aria-hidden /> {t.name}
                    </div>
                    <div className="text-[12.5px] text-muted">
                      {Number(t.target_pct)}% of fees due by {fmtDate(t.target_date)} ({rupeesShort(p.expected)})
                    </div>
                  </div>
                  {canWrite(viewer.role) && <DeleteTargetButton id={t.id} />}
                </div>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="text-2xl font-semibold">{pct(p.current_pct)}</div>
                  <div className="text-right text-[13px] text-ink-2">
                    {p.gap > 0 ? (
                      <>
                        <b className="text-critical-ink">{rupeesShort(p.gap)}</b> short of {rupeesShort(p.goal)}
                      </>
                    ) : (
                      <b className="text-good-ink">Target reached</b>
                    )}
                  </div>
                </div>
                <div className="relative mt-2">
                  <Meter value={p.current_pct} className="h-2" />
                  <span className="absolute top-[-3px] h-3.5 w-0.5 rounded bg-ink" style={{ left: `${Math.min(100, Number(t.target_pct))}%` }} title={`Target ${t.target_pct}%`} />
                </div>
                {p.gap > 0 && (
                  <p className="mt-3 text-[13px] text-ink-2">
                    {p.students_to_close.length} students owe enough to close the gap.{" "}
                    <Link href={`/installments/targets/${t.id}`} className="font-medium text-accent hover:underline">
                      See who to call →
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {canWrite(viewer.role) && (
          <div className="mt-4 border-t border-line pt-4">
            <TargetForm sessionId={session.id} defaultDate={session.end_date} />
          </div>
        )}
      </Card>
    </>
  );
}
