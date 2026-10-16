"use client";

import Link from "next/link";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import type { PaymentRegisterRow } from "@/lib/types";
import { MODE_LABELS, fmtDate, fmtTime, rupees, rupeesShort, todayIST } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StudentSearch } from "@/components/layout/student-search";

export function CollectView() {
  const today = todayIST();
  // today's receipts, newest first
  const { data } = useApi<PaymentRegisterRow[]>(apiUrl("/api/payments", { from: today, to: today }));
  const rows = (data ?? []).slice(0, 200);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const count = rows.filter((r) => r.amount > 0).length;

  return (
    <div className="space-y-6">
      <section className="flex flex-col items-center px-2 pb-4 pt-6 text-center sm:pt-12">
        <span className="mb-5 inline-flex size-14 items-center justify-center rounded-[18px] bg-gradient-to-b from-[#2c8cff] to-[#0062c4] text-[26px] font-bold text-white shadow-[0_6px_18px_rgba(0,98,196,0.35)]">₹</span>
        <h1 className="text-title1 font-bold text-ink sm:text-large">Collect fee</h1>
        <p className="mt-2 text-body text-ink-2">Find the student by name, admission number, father&apos;s name or phone.</p>
        <div className="mt-8 w-full max-w-2xl text-left">
          <StudentSearch mode="collect" large autoFocus placeholder="Search a student…" />
        </div>
      </section>

      <Card
        className="mx-auto max-w-3xl"
        title="Today"
        subtitle={data ? `${fmtDate(today)} · ${count} receipt${count === 1 ? "" : "s"}` : fmtDate(today)}
        actions={data && <span className="figure text-title2">{rupeesShort(total)}</span>}
      >
        {!data ? (
          <p className="py-6 text-center text-subhead text-muted" aria-busy="true">
            Loading today&apos;s receipts…
          </p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-subhead text-muted">Receipts issued today will appear here.</p>
        ) : (
          <ul className="-mx-2">
            {rows.map((r) => (
              <li key={r.payment_id}>
                <Link href={`/payments/${r.payment_id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-fill-2">
                  <Avatar name={r.full_name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-subhead font-medium text-ink">{r.full_name}</span>
                    <span className="block truncate text-caption text-muted">
                      {r.receipt_no} · {MODE_LABELS[r.mode] ?? r.mode} · {fmtTime(r.created_at)}
                      {r.reverses_payment_id ? " · cancellation" : ""}
                    </span>
                  </span>
                  <span className={`text-subhead font-semibold tabular ${r.amount < 0 ? "text-critical-ink" : "text-ink"}`}>{rupees(r.amount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
