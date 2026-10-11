import Link from "next/link";
import { requireWriter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, fmtDate, fmtTime, rupees, todayIST } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StudentSearch } from "@/components/layout/student-search";

export const metadata = { title: "Collect fee" };

type TodayRow = {
  id: string;
  receipt_no: string;
  amount: number;
  mode: string;
  created_at: string;
  reverses_payment_id: string | null;
  students: { id: string; full_name: string; admission_no: string } | null;
};

export default async function CollectPage() {
  await requireWriter();
  const today = todayIST();
  const supabase = await createClient();
  const { data } = await supabase
    .from("payments")
    .select("id, receipt_no, amount, mode, created_at, reverses_payment_id, students(id, full_name, admission_no)")
    .eq("paid_on", today)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as unknown as TodayRow[];
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const byMode = new Map<string, number>();
  for (const r of rows) byMode.set(r.mode, (byMode.get(r.mode) ?? 0) + r.amount);

  return (
    <>
      <PageHeader title="Collect fee" description="Find the student, enter what the parent is paying, print the receipt." crumbs={[{ label: "Fees" }, { label: "Collect fee" }]} />
      <Card bodyClassName="p-5 sm:p-8">
        <div className="mx-auto max-w-2xl">
          <label className="mb-2 block text-sm font-medium text-ink">Search by name, admission number, father&apos;s name or phone</label>
          <StudentSearch mode="collect" large autoFocus placeholder="Start typing… e.g. SPS0123, Aarav, 98290…" />
          <p className="mt-2 text-[12.5px] text-muted">Use ↑ ↓ and Enter to pick a student. Ctrl+K searches from any page.</p>
        </div>
      </Card>

      <Card
        className="mt-4"
        title={`Collected today · ${fmtDate(today)}`}
        description={rows.length ? `${rows.filter((r) => r.amount > 0).length} receipts · ${[...byMode.entries()].map(([m, v]) => `${MODE_LABELS[m] ?? m} ${rupees(v)}`).join(" · ")}` : "No receipts yet today."}
        actions={<span className="text-lg font-semibold tabular">{rupees(total)}</span>}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">Receipts you issue today will appear here.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px]">
                <span className="min-w-0">
                  <Link href={`/payments/${r.id}`} className="font-medium text-ink hover:text-accent hover:underline">
                    {r.receipt_no}
                  </Link>{" "}
                  ·{" "}
                  <Link href={`/students/${r.students?.id}`} className="text-ink-2 hover:underline">
                    {r.students?.full_name} ({r.students?.admission_no})
                  </Link>
                  {r.reverses_payment_id && <Badge tone="critical" className="ml-2">Cancellation</Badge>}
                </span>
                <span className="tabular">
                  <span className="text-muted">{MODE_LABELS[r.mode] ?? r.mode} · {fmtTime(r.created_at)} · </span>
                  <b className={r.amount < 0 ? "text-critical-ink" : ""}>{rupees(r.amount)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
