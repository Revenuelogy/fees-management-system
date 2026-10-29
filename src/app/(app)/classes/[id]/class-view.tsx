"use client";

import Link from "next/link";
import { param, type SearchParams } from "@/lib/context";
import { MONEY, installmentName, moneyHint } from "@/lib/glossary";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/text";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { useApp } from "@/components/layout/app-shell";
import { Pending } from "@/components/ui/page-state";
import { fmtDate, rupeesShort, todayIST } from "@/lib/format";
import type { ClassDetail, FeePosition, FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { Legend, StackedBar } from "@/components/ui/bars";
import { DataTable } from "@/components/ui/data-table";
import { Ring } from "@/components/ui/ring";
import { FEE_STATUS, STATUS_STYLE } from "@/components/ui/status";
import { CollectionTrendChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";
import { FeePositionFigures } from "@/components/fee-position";

const STATUS_KEYS = ["paid_up", "partial", "arrears_only", "not_paying", "free"] as const satisfies readonly FeeStatus[];

export function ClassView({ id, sp }: { id: string; sp: SearchParams }) {
  const { session } = useApp();
  const section = param(sp.section);

  const detailRes = useApi<ClassDetail>(session ? apiUrl(`/api/analytics/classes/${id}`, { session: session.id }) : null);
  const studentsRes = useApi<StudentBalance[]>(session ? apiUrl("/api/analytics/balances", { session: session.id, class: id, section }) : null);
  // the figures on top follow the section picked; the month strip and installments are the whole class
  const posRes = useApi<FeePosition>(session ? apiUrl("/api/analytics/position", { session: session.id, class: id, section }) : null);
  if (!session) return <NoSession />;
  if (!detailRes.data || !studentsRes.data || !posRes.data) return <Pending queries={[detailRes, studentsRes, posRes]} />;
  const d = detailRes.data;
  const k = d.kpis;
  const f = posRes.data;
  const list = (extra: Record<string, string | boolean | undefined>) => withParams("/pending", { class: id, ...extra });
  const students = studentsRes.data.map((s) => ({
    ...s,
    who: `Roll ${s.roll_no ?? "—"} · ${s.section}${s.father_name ? " · " + s.father_name : ""}`,
  }));
  const url = (extra: Record<string, string | boolean | undefined>) => withParams(`/classes/${id}`, { section, ...extra });
  const today = todayIST();
  const bandsTotal = k.bands.full + k.bands.over_half + k.bands.under_half + k.bands.nothing;

  return (
    <div className="space-y-5">
      <PageHeader
        title={d.class.name}
        description={`${d.session.name} · ${k.students} students${section ? ` · section ${section}` : ""}`}
        crumbs={[{ label: "Classes", href: "/classes" }]}
        info={`${moneyHint("total_fee")} ${moneyHint("balance")} ${moneyHint("due_now")} ${moneyHint("old_balance")} ${moneyHint("to_recover")}`}
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

      <section className="rounded-[28px] bg-surface p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex flex-col items-center gap-2 self-center lg:w-[180px] lg:self-start lg:pt-6">
            <Ring value={f.received_pct} size={156} stroke={15}>
              <span className="figure text-[30px] leading-none">{f.received_pct ?? 0}%</span>
              <span className="mt-1 text-footnote text-ink-2">received</span>
            </Ring>
            <p className="text-center text-caption text-muted">
              {rupeesShort(f.received)} of {rupeesShort(f.total_fee)}
              <br />
              total fees this year
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <FeePositionFigures
              f={f}
              links={{
                balance: list({}),
                due_now: list({ due: true }),
                old_balance: list({ prev: true }),
                balance_all: list({}),
                to_recover: list({ due: true }),
              }}
            />
          </div>
        </div>
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">
            {plural(f.students, "student")}
            {section ? ` in section ${section}` : ""}
          </p>
          <StackedBar segments={STATUS_KEYS.map((s) => ({ value: f.status[s], className: STATUS_STYLE[s].dot, label: FEE_STATUS[s].label, display: String(f.status[s]) }))} />
          <Legend
            className="mt-3"
            items={STATUS_KEYS.filter((s) => f.status[s] > 0).map((s) => ({ label: FEE_STATUS[s].label, className: STATUS_STYLE[s].dot, value: String(f.status[s]) }))}
          />
        </div>
      </section>

      <Card
        title="Installments"
        subtitle={section ? "Whole class" : undefined}
        description="Each installment of this year: its total, what was received, and what is left (due till today once its due date has passed, due later before that)."
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {d.installments.map((i) => {
            const due = i.due_date <= today;
            return (
              <li key={i.id}>
                <Link href={`/installments/${i.number}`} className="group block h-full rounded-2xl bg-fill-2 p-4 transition-colors hover:bg-fill">
                  <span className="flex items-center gap-3">
                    <Ring value={i.collection_pct} size={52} stroke={6}>
                      <span className="text-caption font-semibold tabular">{Math.round(i.collection_pct ?? 0)}%</span>
                    </Ring>
                    <span className="min-w-0">
                      <span className="block truncate text-subhead font-semibold text-ink group-hover:text-accent">{installmentName(i.name)}</span>
                      <span className="block text-caption text-muted">Due {fmtDate(i.due_date)}</span>
                    </span>
                  </span>
                  <span className="mt-3 grid grid-cols-3 gap-2">
                    <Mini label="Total" value={rupeesShort(i.expected)} />
                    <Mini label="Received" value={rupeesShort(i.received)} tone="text-good-ink" />
                    <Mini
                      label={i.gap <= 0 ? "Left" : due ? "Due till today" : "Due later"}
                      value={i.gap <= 0 ? "₹0" : rupeesShort(i.gap)}
                      tone={i.gap <= 0 ? "text-good-ink" : due ? "text-critical-ink" : "text-ink"}
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="By month" description="Money received from this class each month next to the installments due. Click a month to see which students paid.">
          <CollectionTrendChart
            data={d.months.map((m) => ({ ...m, advance: 0 }))}
            hrefBase="/monthly/"
            hrefSuffix={`/${id}`}
            height={220}
          />
        </Card>
        <Card title="Students by share received" subtitle={section ? "Whole class" : undefined} description="How many students have received 100%, 50–99%, 1–49% or 0% of their total fees this year.">
          <div>
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
          exportMeta={[
            `${d.class.name}${section ? ` · section ${section}` : ""} · Session ${d.session.name}`,
            `${MONEY.total_fee.label}, ${MONEY.received.label.toLowerCase()}, remaining and due till today are this year's fees; ${MONEY.old_balance.label.toLowerCase()} are separate; ${MONEY.to_recover.label.toLowerCase()} = due till today + previous years' dues`,
            `As of ${fmtDate(today)}`,
          ]}
          columns={[
            { key: "full_name", label: "Student", type: "person", href: "/students/{student_id}", sub: "who" },
            { key: "expected", label: MONEY.total_fee.label, type: "money", total: true, hideOnMobile: true },
            { key: "received", label: MONEY.received.label, type: "money", total: true, hideOnMobile: true },
            { key: "pending", label: MONEY.balance.label, type: "money", total: true },
            { key: "overdue", label: MONEY.due_now.label, type: "money", total: true, alertPositive: true },
            { key: "prev_pending", label: MONEY.old_balance.label, type: "money", total: true, dimZero: true, hideOnMobile: true },
            { key: "total_overdue", label: MONEY.to_recover.label, type: "money", total: true, alertPositive: true, hideOnMobile: true },
            { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
            { key: "fee_status", label: "Status", type: "status" },
          ]}
        />
      </Card>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-caption text-muted">{label}</span>
      <span className={cn("block text-subhead font-semibold tabular", tone ?? "text-ink")}>{value}</span>
    </span>
  );
}
