"use client";

import Link from "next/link";
import { param, type SearchParams } from "@/lib/context";
import { MONEY, moneyHint } from "@/lib/glossary";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, pct, ratioPct, rupeesShort, todayIST } from "@/lib/format";
import type { ClassDetail, FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { Ring } from "@/components/ui/ring";
import { FEE_STATUS, STATUS_STYLE } from "@/components/ui/status";
import { CollectionTrendChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";

const STATUS_KEYS: FeeStatus[] = ["paid_up", "partial", "arrears_only", "not_paying", "free"];

export function ClassView({ id, sp }: { id: string; sp: SearchParams }) {
  const { session } = useApp();
  const section = param(sp.section);

  const detailRes = useApi<ClassDetail>(session ? apiUrl(`/api/analytics/classes/${id}`, { session: session.id }) : null);
  const studentsRes = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/balances", { session: session.id, class: id, section }) : null);
  if (!session) return <NoSession />;
  if (!detailRes.data || !studentsRes.data) return <Pending queries={[detailRes, studentsRes]} />;
  const d = detailRes.data;
  const k = d.kpis;
  const students = studentsRes.data.map((s) => ({
    ...s,
    who: `Roll ${s.roll_no ?? "—"} · ${s.section}${s.father_name ? " · " + s.father_name : ""}`,
  }));
  const url = (extra: Record<string, string | boolean | undefined>) => withParams(`/classes/${id}`, { section, ...extra });
  const received = ratioPct(k.received, k.expected) ?? 0;
  const today = todayIST();
  const bandsTotal = k.bands.full + k.bands.over_half + k.bands.under_half + k.bands.nothing;

  return (
    <div className="space-y-5">
      <PageHeader
        title={d.class.name}
        description={`${d.session.name} · ${k.students} students${section ? ` · section ${section}` : ""}`}
        crumbs={[{ label: "Classes", href: "/classes" }]}
        info={`${moneyHint("received")} ${moneyHint("balance")} ${moneyHint("due_now")} ${moneyHint("old_balance")}`}
      >
        {d.sections.length > 1 && (
          <Segmented
            options={[
              { label: "All sections", href: url({ section: undefined }), active: !section },
              ...d.sections.map((s) => ({ label: s.section, href: url({ section: s.section }), active: section === s.section })),
            ]}
          />
        )}
      </PageHeader>

      <section className="rounded-[28px] bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center">
          <Ring value={received} size={168} stroke={16} className="self-center">
            <span className="figure text-[32px] leading-none">{Math.round(received)}%</span>
            <span className="mt-1 text-footnote text-ink-2">received</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-footnote text-ink-2">{MONEY.received.label}</p>
                <p className="figure mt-1 text-title1">{rupeesShort(k.received)}</p>
                <p className="text-caption text-muted">of {rupeesShort(k.expected)} total fee</p>
              </div>
              <div>
                <p className="text-footnote text-ink-2">{MONEY.balance.label}</p>
                <p className="figure mt-1 text-title1">{rupeesShort(k.pending)}</p>
                <p className="text-caption text-muted">this year</p>
              </div>
              <div>
                <p className="text-footnote text-ink-2">{MONEY.due_now.label}</p>
                <p className={`figure mt-1 text-title1 ${k.overdue > 0 ? "text-critical-ink" : "text-good-ink"}`}>{rupeesShort(k.overdue)}</p>
                <p className="text-caption text-muted">{pct(ratioPct(k.due_expected - k.overdue, k.due_expected), 0)} of fees due so far received</p>
              </div>
            </div>
            {k.prev_pending > 0 && (
              <p className="mt-4 text-footnote text-ink-2">
                {MONEY.old_balance.label}: <span className="font-semibold tabular text-serious-ink">{rupeesShort(k.prev_pending)}</span> left from earlier years
              </p>
            )}
            <div className="mt-6">
              <StackedBar
                segments={STATUS_KEYS.map((s) => ({ value: k.status[s as keyof typeof k.status] ?? 0, className: STATUS_STYLE[s].dot, label: FEE_STATUS[s].label, display: String(k.status[s as keyof typeof k.status] ?? 0) }))}
              />
              <Legend
                className="mt-3"
                items={STATUS_KEYS.filter((s) => (k.status[s as keyof typeof k.status] ?? 0) > 0).map((s) => ({
                  label: FEE_STATUS[s].label,
                  className: STATUS_STYLE[s].dot,
                  value: String(k.status[s as keyof typeof k.status]),
                }))}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="By month" description="Money received from this class each month next to the installments due. Click a month to see which students paid.">
          <CollectionTrendChart
            data={d.months.map((m) => ({ ...m, advance: 0 }))}
            hrefBase="/monthly/"
            hrefSuffix={`/${id}`}
            height={220}
          />
        </Card>
        <Card title="Installments">
          <ul className="space-y-4">
            {d.installments.map((i) => (
              <li key={i.id}>
                <Link href={`/installments/${i.number}`} className="group flex items-center gap-4 rounded-2xl p-1 transition-colors hover:bg-fill-2">
                  <Ring value={i.collection_pct} size={56} stroke={7}>
                    <span className="text-caption font-semibold tabular">{Math.round(i.collection_pct ?? 0)}%</span>
                  </Ring>
                  <span className="min-w-0 flex-1">
                    <span className="block text-subhead font-semibold text-ink group-hover:text-accent">{i.name}</span>
                    <span className="block text-caption text-muted">Due {fmtDate(i.due_date)}</span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`block text-subhead font-semibold tabular ${i.gap <= 0 ? "text-good-ink" : i.due_date <= today ? "text-critical-ink" : "text-ink-2"}`}
                    >
                      {rupeesShort(i.gap)}
                    </span>
                    <span className="block text-caption text-muted">{i.due_date <= today ? MONEY.due_now.label.toLowerCase() : MONEY.due_later.label.toLowerCase()}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-line pt-5">
            <p className="mb-3 text-footnote font-medium text-ink-2">Share of total fee received (students)</p>
            <StackedBar
              total={bandsTotal}
              segments={[
                { value: k.bands.full, className: "bg-good", label: "100%", display: String(k.bands.full) },
                { value: k.bands.over_half, className: "bg-warning", label: "50–99%", display: String(k.bands.over_half) },
                { value: k.bands.under_half, className: "bg-serious", label: "1–49%", display: String(k.bands.under_half) },
                { value: k.bands.nothing, className: "bg-critical", label: "0%", display: String(k.bands.nothing) },
              ]}
            />
            <Legend
              className="mt-3"
              items={[
                { label: "100%", className: "bg-good", value: String(k.bands.full) },
                { label: "50–99%", className: "bg-warning", value: String(k.bands.over_half) },
                { label: "1–49%", className: "bg-serious", value: String(k.bands.under_half) },
                { label: "0%", className: "bg-critical", value: String(k.bands.nothing) },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card title="Students">
        <DataTable
          rows={students as unknown as Record<string, unknown>[]}
          searchKeys={["full_name", "admission_no", "father_name", "phone", "roll_no"]}
          filters={[
            { key: "fee_status", label: "Status", options: STATUS_KEYS.map((s) => ({ value: s, label: FEE_STATUS[s].label })) },
            ...(d.sections.length > 1 ? [{ key: "section", label: "Section", options: d.sections.map((s) => ({ value: s.section, label: s.section })) }] : []),
          ]}
          totals
          pageSize={50}
          exportName={`${d.class.name}-${d.session.name}`}
          exportMeta={[`${d.class.name} · Session ${d.session.name}`, "Balance and Due now are this year's fees; Old balance is from earlier years", `As of ${fmtDate(today)}`]}
          columns={[
            { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
            { key: "received", label: MONEY.received.label, type: "money", total: true, hideOnMobile: true },
            { key: "pending", label: MONEY.balance.label, type: "money", total: true },
            { key: "overdue", label: MONEY.due_now.label, type: "money", total: true, alertPositive: true },
            { key: "prev_pending", label: MONEY.old_balance.label, type: "money", total: true, dimZero: true, hideOnMobile: true },
            { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
            { key: "fee_status", label: "Status", type: "status" },
          ]}
        />
      </Card>
    </div>
  );
}
