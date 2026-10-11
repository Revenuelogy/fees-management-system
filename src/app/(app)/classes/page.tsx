import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { flag, getActiveSession } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { ClassSummaryRow } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Legend, Meter, StackedBar } from "@/components/ui/bars";
import { FEE_STATUS } from "@/components/ui/status";
import { NoSession } from "@/components/no-session";

export const metadata = { title: "Classes" };

const STATUS: { key: keyof ClassSummaryRow["status"]; cls: string; label: string }[] = [
  { key: "paid_up", cls: "bg-good", label: FEE_STATUS.paid_up.label },
  { key: "partial", cls: "bg-warning", label: FEE_STATUS.partial.label },
  { key: "arrears_only", cls: "bg-serious", label: FEE_STATUS.arrears_only.label },
  { key: "not_paying", cls: "bg-critical", label: FEE_STATUS.not_paying.label },
  { key: "free", cls: "bg-line-strong", label: FEE_STATUS.free.label },
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
  const tot = rows.reduce(
    (a, r) => ({
      students: a.students + r.students,
      expected: a.expected + r.expected,
      received: a.received + r.received,
      pending: a.pending + r.pending,
      overdue: a.overdue + r.overdue,
    }),
    { students: 0, expected: 0, received: 0, pending: 0, overdue: 0 },
  );

  return (
    <>
      <PageHeader
        title="Classes"
        description={`Session ${session.name}: the same analysis as the school dashboard, one row per class. Open a class for its students, months and installments.`}
        crumbs={[{ label: session.name, href: "/" }, { label: "Classes" }]}
      >
        <Segmented
          options={[
            { label: "Current session only", href: "/classes", active: !arrears },
            { label: "Including previous dues", href: "/classes?arrears=1", active: arrears },
          ]}
        />
      </PageHeader>
      <Card>
        <div className="mb-3">
          <Legend items={STATUS.map((s) => ({ label: s.label, className: s.cls }))} />
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-[12px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Class</th>
                <th className="px-3 py-2 text-right font-medium">Students</th>
                <th className="px-3 py-2 text-right font-medium">Expected</th>
                <th className="px-3 py-2 text-right font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Collection</th>
                <th className="px-3 py-2 text-right font-medium">Pending</th>
                <th className="px-3 py-2 text-right font-medium">Overdue</th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Share of pending</th>
                <th className="hidden min-w-[160px] px-3 py-2 font-medium lg:table-cell">Students by status</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {rows.map((r) => (
                <tr key={r.class_id ?? "none"} className="border-t border-line hover:bg-surface-2/60">
                  <td className="px-3 py-2.5">
                    {r.class_id ? (
                      <Link href={withParams(`/classes/${r.class_id}`, { arrears: arrears || undefined })} className="font-medium text-ink hover:text-accent hover:underline">
                        {r.class_name}
                      </Link>
                    ) : (
                      <Link href="/pending?arrears=1&unassigned=1" className="font-medium text-ink-2 hover:underline">
                        {r.class_name}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">{r.students}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{rupees(r.expected)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{rupees(r.received)}</td>
                  <td className="min-w-[130px] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Meter value={r.collection_pct} className="w-16" />
                      {pct(r.collection_pct)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">{rupees(r.pending)}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right ${r.overdue > 0 ? "text-critical-ink" : "text-muted"}`}>{rupees(r.overdue)}</td>
                  <td className="hidden px-3 py-2.5 text-right md:table-cell">{pct(r.share_of_pending)}</td>
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    <StackedBar
                      segments={STATUS.map((s) => ({
                        value: r.status[s.key] ?? 0,
                        className: s.cls,
                        label: s.label,
                        display: String(r.status[s.key] ?? 0),
                      }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="tabular">
              <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                <td className="px-3 py-2">School</td>
                <td className="px-3 py-2 text-right">{tot.students}</td>
                <td className="px-3 py-2 text-right">{rupees(tot.expected)}</td>
                <td className="px-3 py-2 text-right">{rupees(tot.received)}</td>
                <td className="px-3 py-2">{pct(ratioPct(tot.received, tot.expected))}</td>
                <td className="px-3 py-2 text-right">{rupees(tot.pending)}</td>
                <td className="px-3 py-2 text-right">{rupees(tot.overdue)}</td>
                <td className="hidden px-3 py-2 text-right md:table-cell">100%</td>
                <td className="hidden lg:table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          Totals reconcile with the dashboard: {rupeesShort(tot.pending)} pending across all classes.
        </p>
      </Card>
    </>
  );
}
