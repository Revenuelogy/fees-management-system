import Link from "next/link";
import { FileText, IndianRupee } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { flag, getActiveSession, param } from "@/lib/context";
import { createClient } from "@/lib/supabase/server";
import { MODE_LABELS, fmtDate, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import type { Dashboard, FeeStatus, StudentBalance } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented, withParams } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/ui/kpi";
import { Card } from "@/components/ui/card";
import { BarList, StackedBar } from "@/components/ui/bars";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { FEE_STATUS, FeeStatusBadge } from "@/components/ui/status";
import { CollectionTrendChart } from "@/components/charts/charts";
import { NoSession } from "@/components/no-session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const viewer = await requireStaff();
  const sp = await searchParams;
  const session = await getActiveSession();
  if (!session) return <NoSession />;

  const arrears = flag(sp.arrears, false);
  const sort = param(sp.sort) === "days" ? "days" : "amount";
  const top = Math.min(Math.max(Number(param(sp.top) ?? 20) || 20, 5), 200);

  const supabase = await createClient();
  const [{ data: dash, error }, defaultersRes] = await Promise.all([
    supabase.rpc("dashboard", { p_session: session.id, p_include_arrears: arrears }),
    (() => {
      const q = supabase
        .rpc("student_balances", { p_session: session.id })
        .gt(arrears ? "total_overdue" : "overdue", 0);
      return sort === "days"
        ? q.order("days_since_payment", { ascending: false, nullsFirst: true }).order(arrears ? "total_overdue" : "overdue", { ascending: false }).limit(top)
        : q.order(arrears ? "total_overdue" : "overdue", { ascending: false }).limit(top);
    })(),
  ]);
  if (error || !dash) throw new Error(error?.message ?? "Could not load the dashboard");
  const d = dash as Dashboard;
  const k = d.kpis;
  const defaulters = (defaultersRes.data ?? []) as StudentBalance[];

  const expected = k.session_expected + (arrears ? k.prev_opening : 0);
  const received = k.session_received + (arrears ? k.prev_recovered : 0);
  const pending = k.session_pending + (arrears ? k.prev_pending : 0);
  const dueExpected = k.session_due_expected + (arrears ? k.prev_opening : 0);
  const overdue = k.session_overdue + (arrears ? k.prev_pending : 0);
  const base = (extra: Record<string, string | number | boolean | undefined>) =>
    withParams("/", { arrears: arrears || undefined, sort: sort === "days" ? "days" : undefined, top: top !== 20 ? top : undefined, ...extra });

  const classesPending = [...d.classes].filter((c) => c.pending > 0).sort((a, b) => b.pending - a.pending);
  const classesPct = d.classes.filter((c) => c.class_id && c.expected > 0);
  const statusOrder: FeeStatus[] = ["paid_up", "partial", "arrears_only", "not_paying", "free", "no_plan"];
  const statusColor: Record<FeeStatus, string> = {
    paid_up: "bg-good",
    partial: "bg-warning",
    arrears_only: "bg-serious",
    not_paying: "bg-critical",
    free: "bg-line-strong",
    no_plan: "bg-surface-3",
  };
  const statusTotal = statusOrder.reduce((s, x) => s + (d.status[x] ?? 0), 0);
  const modesTotal = d.modes.reduce((s, m) => s + m.amount, 0);

  return (
    <>
      <PageHeader
        title={`Session ${d.session.name}`}
        description={`Where the fee money is, as of ${fmtDate(d.today)}. ${fmtDate(d.session.start_date)} – ${fmtDate(d.session.end_date)}.`}
        actions={
          <>
            <LinkButton href={withParams("/reports/summary", { arrears: arrears || undefined })} variant="secondary">
              <FileText className="size-4" /> Owner summary
            </LinkButton>
            {canWrite(viewer.role) && (
              <LinkButton href="/collect" variant="primary">
                <IndianRupee className="size-4" /> Collect fee
              </LinkButton>
            )}
          </>
        }
      >
        <Segmented
          options={[
            { label: "Current session only", href: base({ arrears: undefined }), active: !arrears },
            { label: "Including previous dues", href: base({ arrears: true }), active: arrears, title: "Adds unpaid fees carried from earlier sessions" },
          ]}
        />
      </PageHeader>

      <KpiGrid cols={5}>
        <Kpi
          label={arrears ? "Expected (incl. previous dues)" : "Session expected"}
          value={rupeesShort(expected)}
          href="/classes"
          sub={
            <>
              {k.students_billed} students · after {rupeesShort(k.concession)} concessions
              {arrears && <> · incl. {rupeesShort(k.prev_opening)} opening dues</>}
            </>
          }
        />
        <Kpi
          label="Received"
          value={rupeesShort(received)}
          href="/payments?preset=session"
          meter={ratioPct(received, expected)}
          sub={<>{pct(ratioPct(received, expected))} of expected</>}
        />
        <Kpi
          label="Pending"
          value={rupeesShort(pending)}
          href={withParams("/pending", { arrears: arrears || undefined })}
          sub={<>{pct(ratioPct(pending, expected))} of expected · includes installments not yet due</>}
        />
        <Kpi
          label="Overdue (due-to-date gap)"
          value={rupeesShort(overdue)}
          tone={overdue > 0 ? "critical" : "good"}
          href={withParams("/pending", { arrears: arrears || undefined, due: 1 })}
          sub={
            <>
              {rupeesShort(dueExpected)} was due by today · {pct(ratioPct(dueExpected - overdue, dueExpected))} collected ·{" "}
              {k.students_with_overdue} students behind
            </>
          }
        />
        <Kpi
          label="Previous dues recovered"
          value={rupeesShort(k.prev_recovered)}
          href={withParams("/pending", { arrears: 1, prev: 1 })}
          meter={ratioPct(k.prev_recovered, k.prev_opening)}
          sub={
            k.prev_opening > 0 ? (
              <>
                {pct(ratioPct(k.prev_recovered, k.prev_opening))} of {rupeesShort(k.prev_opening)} opening arrears · {rupeesShort(k.prev_pending)} still
                pending from {k.students_with_prev_dues} students
              </>
            ) : (
              "No dues carried from earlier sessions"
            )
          }
        />
      </KpiGrid>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title="Class-wise pending"
          description={`Bar = pending rupees; label = share of all pending (${rupeesShort(pending)}). Click a class to open it.`}
        >
          {classesPending.length === 0 ? (
            <p className="text-sm text-ink-2">Nothing pending.</p>
          ) : (
            <BarList
              rows={classesPending.map((c) => ({
                label: c.class_name,
                value: c.pending,
                display: rupeesShort(c.pending),
                sub: `${pct(c.share_of_pending)} of all pending`,
                href: c.class_id ? withParams(`/classes/${c.class_id}`, { arrears: arrears || undefined }) : withParams("/pending", { arrears: 1, unassigned: 1 }),
                title: `${c.class_name}: ${rupees(c.pending)} pending (${pct(c.share_of_pending)} of school pending), ${rupees(c.overdue)} overdue`,
              }))}
            />
          )}
        </Card>
        <Card
          title="Class-wise collection %"
          description="Received as a share of each class's own expected, so a small class with a big problem stands out."
        >
          <BarList
            max={100}
            rows={[...classesPct]
              .sort((a, b) => (a.collection_pct ?? 0) - (b.collection_pct ?? 0))
              .map((c) => ({
                label: c.class_name,
                value: c.collection_pct ?? 0,
                display: pct(c.collection_pct),
                sub: `${rupeesShort(c.received)} of ${rupeesShort(c.expected)} · due-to-date ${pct(c.due_collection_pct)}`,
                href: withParams(`/classes/${c.class_id}`, { arrears: arrears || undefined }),
              }))}
          />
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Collection trend"
        description={
          arrears
            ? "Money received each month, split by what it paid for, against installments scheduled that month. Click a month to analyse it."
            : "Current-year money received each month against installments scheduled that month. Click a month to analyse it."
        }
      >
        <CollectionTrendChart data={d.trend} includeArrears={arrears} hrefBase="/monthly?month=" />
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-[13px] sm:grid-cols-4">
          <div>
            <div className="text-muted">Money in during session</div>
            <div className="font-semibold tabular text-ink">{rupees(d.cash.total)}</div>
          </div>
          <div>
            <div className="text-muted">→ current year fees</div>
            <div className="font-semibold tabular text-ink">{rupees(d.cash.current)}</div>
          </div>
          <div>
            <div className="text-muted">→ previous dues</div>
            <div className="font-semibold tabular text-ink">{rupees(d.cash.arrears)}</div>
          </div>
          <div>
            <div className="text-muted">→ advance / next session</div>
            <div className="font-semibold tabular text-ink">{rupees(d.cash.advance)}</div>
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card title="Students by fee status" description="Recalculated live from charges and payments.">
            <StackedBar
              total={statusTotal}
              height="h-4"
              segments={statusOrder.map((s) => ({ value: d.status[s] ?? 0, className: statusColor[s], label: FEE_STATUS[s].label, display: String(d.status[s] ?? 0) }))}
            />
            <ul className="mt-3 space-y-1.5">
              {statusOrder
                .filter((s) => (d.status[s] ?? 0) > 0)
                .map((s) => (
                  <li key={s} className="flex items-center justify-between gap-2 text-[13px]">
                    <Link href={withParams("/pending", { arrears: arrears || undefined, status: s })} className="hover:underline">
                      <FeeStatusBadge status={s} />
                    </Link>
                    <span className="tabular text-ink">
                      <b>{d.status[s]}</b> <span className="text-muted">· {pct(ratioPct(d.status[s] ?? 0, statusTotal), 0)}</span>
                    </span>
                  </li>
                ))}
            </ul>
          </Card>

          <Card title="Pending by fee head">
            <BarList
              labelWidth="w-28"
              rows={d.heads
                .filter((h) => h.expected > 0)
                .map((h) => ({
                  label: h.fee_head,
                  value: h.pending,
                  display: rupeesShort(h.pending),
                  sub: `${pct(ratioPct(h.received, h.expected), 0)} collected`,
                  title: `${h.fee_head}: expected ${rupees(h.expected)}, received ${rupees(h.received)}, pending ${rupees(h.pending)}`,
                }))}
            />
          </Card>

          <Card title="Payment modes" description="Money received in this session by mode.">
            <BarList
              labelWidth="w-24"
              rows={d.modes.map((m) => ({
                label: MODE_LABELS[m.mode] ?? m.mode,
                value: m.amount,
                display: rupeesShort(m.amount),
                sub: `${pct(ratioPct(m.amount, modesTotal), 0)} · ${m.count} receipts`,
              }))}
            />
          </Card>
        </div>
        <Card
          className="mt-4"
          title={`Top ${top} students not paying`}
          description={arrears ? "Ranked by overdue amount including previous dues." : "Ranked by this session's overdue amount (installments already due)."}
          actions={
            <>
              <Segmented
                label="Sort"
                options={[
                  { label: "Amount", href: base({ sort: undefined }), active: sort === "amount" },
                  { label: "Days silent", href: base({ sort: "days" }), active: sort === "days" },
                ]}
              />
              <Segmented
                label="Show"
                options={[20, 50, 100].map((n) => ({ label: String(n), href: base({ top: n === 20 ? undefined : n }), active: top === n }))}
              />
            </>
          }
        >
          <DataTable
            rows={defaulters as unknown as Record<string, unknown>[]}
            pageSize={top}
            exportName={`top-defaulters-${d.session.name}`}
            exportMeta={[`Session ${d.session.name}`, arrears ? "Including previous dues" : "Current session only", `Sorted by ${sort}`]}
            columns={[
              { key: "full_name", label: "Student", href: "/students/{student_id}", sub: "admission_no" },
              { key: "class_name", label: "Class", sub: "section" },
              { key: arrears ? "total_overdue" : "overdue", label: "Overdue", type: "money", alertPositive: true },
              { key: "total_pending", label: "Total pending", type: "money", hideOnMobile: true },
              { key: "prev_pending", label: "Of which prev. dues", type: "money", dimZero: true },
              { key: "last_paid_on", label: "Last paid", type: "date", hideOnMobile: true },
              { key: "days_since_payment", label: "Days silent", type: "number" },
              { key: "phone", label: "Phone", hideOnMobile: true },
            ]}
            empty="No one is behind on payments."
          />
          <div className="mt-3 text-right">
            <Link href={withParams("/pending", { arrears: arrears || undefined, due: 1 })} className="text-[13px] font-medium text-accent hover:underline">
              See all pending fees →
            </Link>
          </div>
        </Card>

    </>
  );
}
