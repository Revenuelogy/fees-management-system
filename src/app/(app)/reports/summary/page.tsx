import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession, getSettings } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, pct, ratioPct, rupees, rupeesShort, todayIST } from "@/lib/format";
import type { Dashboard, MonthSummary, StudentBalance } from "@/lib/types";
import { Segmented } from "@/components/ui/segmented";
import { PrintButton } from "@/components/ui/print-button";
import { NoSession } from "@/components/no-session";
import { ShareSummary } from "./share-summary";

export const metadata = { title: "Owner summary" };

export default async function OwnerSummaryPage({ searchParams }: PageProps<"/reports/summary">) {
  await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;
  const arrears = flag(sp.arrears, true);
  const today = todayIST();
  const month = today >= session.start_date && today <= session.end_date ? today.slice(0, 7) : session.end_date.slice(0, 7);

  const supabase = await createClient();
  const [dashRes, defRes, monthRes, settings] = await Promise.all([
    supabase.rpc("dashboard", { p_session: session.id, p_include_arrears: arrears }),
    supabase
      .rpc("student_balances", { p_session: session.id })
      .gt(arrears ? "total_overdue" : "overdue", 0)
      .order(arrears ? "total_overdue" : "overdue", { ascending: false })
      .limit(10),
    supabase.rpc("month_summary", { p_month: `${month}-01`, p_carry: true, p_arrears: arrears }),
    getSettings(),
  ]);
  if (dashRes.error || !dashRes.data) throw new Error(dashRes.error?.message ?? "Could not load summary");
  const d = dashRes.data as Dashboard;
  const k = d.kpis;
  const top = (defRes.data ?? []) as StudentBalance[];
  const m = (monthRes.data ?? null) as MonthSummary | null;

  const expected = k.session_expected + (arrears ? k.prev_opening : 0);
  const received = k.session_received + (arrears ? k.prev_recovered : 0);
  const pending = k.session_pending + (arrears ? k.prev_pending : 0);
  const overdue = k.session_overdue + (arrears ? k.prev_pending : 0);
  const dueExpected = k.session_due_expected + (arrears ? k.prev_opening : 0);
  const classes = [...d.classes].sort((a, b) => b.pending - a.pending);
  const months = d.trend.filter((t) => !t.is_future);

  const text = [
    `*${settings?.school_name ?? "School"} — fee summary ${d.session.name}* (as of ${fmtDate(today)})`,
    `Expected: ${rupeesShort(expected)} | Received: ${rupeesShort(received)} (${pct(ratioPct(received, expected))})`,
    `Pending: ${rupeesShort(pending)} | Overdue: ${rupeesShort(overdue)}`,
    `Previous dues recovered: ${rupeesShort(k.prev_recovered)} of ${rupeesShort(k.prev_opening)}`,
    m ? `${m.label}: ${rupeesShort(m.summary.received)} received, ${rupeesShort(m.summary.still_to_come)} still to come` : "",
    `Top pending classes: ${classes.slice(0, 3).map((c) => `${c.class_name} ${rupeesShort(c.pending)}`).join(", ")}`,
    `Top defaulters: ${top.slice(0, 5).map((s) => `${s.full_name} (${s.class_name ?? "-"}) ${rupeesShort(arrears ? s.total_overdue : s.overdue)}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          options={[
            { label: "Including previous dues", href: "/reports/summary", active: arrears },
            { label: "Current session only", href: "/reports/summary?arrears=0", active: !arrears },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ShareSummary text={text} />
          <PrintButton label="Print / save as PDF" variant="primary" />
        </div>
      </div>

      <article className="rounded-xl border border-line bg-surface p-6 text-[13px] shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="text-lg font-bold">{settings?.school_name}</div>
            <div className="text-ink-2">Fee summary · Session {d.session.name}</div>
          </div>
          <div className="text-right text-ink-2">
            As of {fmtDate(today)}
            <div className="text-[12px] text-muted">{arrears ? "Including previous-session dues" : "Current session only"}</div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 border-b border-line py-4 sm:grid-cols-5">
          {[
            ["Expected", rupees(expected), `${k.students_billed} students`],
            ["Received", rupees(received), `${pct(ratioPct(received, expected))} of expected`],
            ["Pending", rupees(pending), `${pct(ratioPct(pending, expected))} of expected`],
            ["Overdue", rupees(overdue), `${pct(ratioPct(dueExpected - overdue, dueExpected))} of due collected`],
            ["Prev. dues recovered", rupees(k.prev_recovered), `of ${rupees(k.prev_opening)}`],
          ].map(([l, v, s]) => (
            <div key={l}>
              <div className="text-muted">{l}</div>
              <div className="text-[17px] font-semibold tabular">{v}</div>
              <div className="text-[12px] text-ink-2">{s}</div>
            </div>
          ))}
        </section>

        {m && (
          <section className="border-b border-line py-3">
            <h2 className="mb-1 font-semibold">{m.label}</h2>
            <p className="text-ink-2">
              Expected {rupees(m.summary.expected)} · received {rupees(m.summary.received)} ({rupees(m.summary.received_current)} current, {rupees(m.summary.received_arrears)} previous dues) ·
              still to come {rupees(m.summary.still_to_come)} · {m.summary.students_paid} students paid, {m.summary.students_expected_not_paid} expected but not paid.
            </p>
          </section>
        )}

        <div className="grid gap-6 py-4 md:grid-cols-2">
          <section>
            <h2 className="mb-2 font-semibold">Class-wise pending</h2>
            <table className="w-full tabular">
              <thead className="text-left text-[11.5px] uppercase text-muted">
                <tr>
                  <th className="pb-1 font-medium">Class</th>
                  <th className="pb-1 text-right font-medium">Pending</th>
                  <th className="pb-1 text-right font-medium">Share</th>
                  <th className="pb-1 text-right font-medium">Coll. %</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.class_id ?? "none"} className="border-t border-line">
                    <td className="py-1">{c.class_name}</td>
                    <td className="py-1 text-right">{rupees(c.pending)}</td>
                    <td className="py-1 text-right">{pct(c.share_of_pending)}</td>
                    <td className="py-1 text-right">{pct(c.collection_pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-2 font-semibold">Top 10 students not paying</h2>
            <table className="w-full tabular">
              <thead className="text-left text-[11.5px] uppercase text-muted">
                <tr>
                  <th className="pb-1 font-medium">Student</th>
                  <th className="pb-1 font-medium">Class</th>
                  <th className="pb-1 text-right font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody>
                {top.map((s) => (
                  <tr key={s.student_id} className="border-t border-line">
                    <td className="py-1">
                      {s.full_name}
                      <div className="text-[11.5px] text-muted">{s.phone}</div>
                    </td>
                    <td className="py-1">{s.class_name ?? "—"}</td>
                    <td className="py-1 text-right">{rupees(arrears ? s.total_overdue : s.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <section className="border-t border-line pt-4">
          <h2 className="mb-2 font-semibold">Month by month</h2>
          <table className="w-full tabular">
            <thead className="text-left text-[11.5px] uppercase text-muted">
              <tr>
                <th className="pb-1 font-medium">Month</th>
                <th className="pb-1 text-right font-medium">Scheduled</th>
                <th className="pb-1 text-right font-medium">Received</th>
                <th className="pb-1 text-right font-medium">Current yr</th>
                <th className="pb-1 text-right font-medium">Prev. dues</th>
              </tr>
            </thead>
            <tbody>
              {months.map((t) => (
                <tr key={t.month} className="border-t border-line">
                  <td className="py-1">{t.label}</td>
                  <td className="py-1 text-right">{rupees(t.expected)}</td>
                  <td className="py-1 text-right">{rupees(t.received)}</td>
                  <td className="py-1 text-right">{rupees(t.current)}</td>
                  <td className="py-1 text-right">{rupees(t.arrears)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </div>
  );
}
