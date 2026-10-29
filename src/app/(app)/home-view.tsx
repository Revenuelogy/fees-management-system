"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, IndianRupee, PhoneCall, RotateCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { type SearchParams, param } from "@/lib/context";
import { fmtDate, num, pct, ratioPct, rupees, rupeesShort } from "@/lib/format";
import { MONEY } from "@/lib/glossary";
import { QUICK_PERIODS, paymentsHref, resolvePeriod, type Period } from "@/lib/period";
import { plural } from "@/lib/text";
import type { FeePosition, HomeClass, HomeFees, HomeToday, RecoverySummary, SetupChecklist } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { NoSession } from "@/components/no-session";
import { FeePositionFigures } from "@/components/fee-position";
import { LinkButton } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { StackedBar } from "@/components/ui/bars";
import { Segmented, withParams } from "@/components/ui/segmented";
import { FEE_STATUS, STATUS_STYLE } from "@/components/ui/status";

type Query<T> = { data?: T; error?: Error; mutate: () => unknown };

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" });

/**
 * Home: the whole school on one screen, numbers first. The year's fees (this year, previous years and both together),
 * then what happened today, yesterday or in the last 7 / 30 days (money in and where it
 * came from, calls, activities), then the school and its classes. Every number opens the page that explains it; each
 * card loads (and fails) on its own.
 */
export function HomeView({ sp }: { sp: SearchParams }) {
  const { session, writer, settings } = useApp();
  if (!session) return <NoSession />;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone || "Asia/Kolkata" });
  const period = resolvePeriod(param(sp.period), undefined, undefined, today, null, "today");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-title1 font-bold text-ink sm:text-large">Home</h1>
          <p className="mt-1 text-body text-ink-2">
            {session.name} · {WEEKDAY.format(new Date(today + "T00:00:00Z"))}, {fmtDate(today)}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {writer && (
            <LinkButton href="/collect" variant="primary" size="lg">
              <IndianRupee className="size-4" strokeWidth={2.4} /> Collect fee
            </LinkButton>
          )}
          <LinkButton href="/reports/summary" size="lg">
            Owner report
          </LinkButton>
        </div>
      </header>

      {writer && <NeedsAttention sessionId={session.id} sessionName={session.name} />}

      <FeePositionCard sessionId={session.id} sessionName={session.name} />

      <section aria-label={`What happened · ${period.label}`} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <h2 className="text-title3 font-semibold text-ink">What happened</h2>
          <Segmented options={QUICK_PERIODS.map((p) => ({ label: p.label, href: withParams("/", { period: p.key === "today" ? undefined : p.key }), active: p.key === period.key }))} />
        </div>
        <PeriodCards period={period} />
      </section>

      <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[2fr_3fr]">
        <SchoolCard sessionId={session.id} sessionName={session.name} />
        <ClassesCard sessionId={session.id} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Card frame: the title never waits for data; grey bars while loading; an error stays inside the card
// ---------------------------------------------------------------------------------------------

function HomeCard<T>({
  title,
  info,
  query,
  lines = 3,
  className,
  children,
}: {
  title: string;
  info?: string;
  query: Query<T>;
  lines?: number;
  className?: string;
  children: (data: T) => React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col rounded-[var(--radius-card)] bg-surface p-5 shadow-card sm:p-6", className)}>
      <h2 className="flex items-center gap-1.5 text-headline font-semibold text-ink">
        {title}
        {info && <InfoTip align="start">{info}</InfoTip>}
      </h2>
      <div className="mt-4 flex-1">
        {query.data ? (
          children(query.data)
        ) : query.error ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-fill-2 p-4">
            <p className="text-subhead text-ink">Couldn&rsquo;t load this.</p>
            <button
              type="button"
              onClick={() => query.mutate()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-fill px-4 text-subhead font-medium text-ink hover:bg-fill-2"
            >
              <RotateCw className="size-4" /> Try again
            </button>
          </div>
        ) : (
          <div className="space-y-3" aria-label="Loading" role="status">
            <div className="h-9 w-2/3 animate-pulse rounded-xl bg-fill" />
            {Array.from({ length: lines }, (_, i) => (
              <div key={i} className="h-4 animate-pulse rounded-full bg-fill-2" style={{ width: `${85 - i * 12}%` }} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 1 · Needs attention: open setup tasks (admin and accountant, who can fix them)
// ---------------------------------------------------------------------------------------------

function NeedsAttention({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const { classes } = useApp();
  const res = useApi<SetupChecklist>(apiUrl("/api/setup/checklist", { session: sessionId }));
  if (!res.data) return null;
  const c = res.data;
  const active = classes.filter((k) => k.is_active);
  const withStructure = new Set(c.classes_with_structure);
  const missing = active.filter((k) => !withStructure.has(k.id));
  const items: { text: string; href: string }[] = [];
  if (c.installments.length === 0) items.push({ text: `${sessionName} has no installments yet`, href: "/setup/sessions" });
  if (active.length === 0) items.push({ text: "No classes yet", href: "/setup/classes" });
  if (c.active_heads === 0) items.push({ text: "No fee types yet", href: "/setup/classes#fee-heads" });
  if (active.length > 0 && c.installments.length > 0 && missing.length > 0) {
    items.push({ text: `${plural(missing.length, "class has", "classes have")} no fee amounts`, href: `/setup/fee-structure?class=${missing[0].id}` });
  }
  if (c.enrolled === 0) items.push({ text: `Nobody is enrolled in ${sessionName} yet`, href: "/setup/import?tab=students" });
  if ((c.without_plan ?? 0) > 0) {
    items.push({ text: `${plural(c.without_plan ?? 0, "student has", "students have")} no fees assigned`, href: "/setup/fee-structure" });
  }
  if (items.length === 0) return null;
  return (
    <section className="rounded-[var(--radius-card)] bg-serious-soft px-5 py-3.5" aria-label="Needs attention">
      <ul className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {items.map((i) => (
          <li key={i.text}>
            <Link href={i.href} className="inline-flex min-h-8 items-center gap-2 text-subhead font-medium text-serious-ink hover:underline">
              <AlertTriangle className="size-4 shrink-0" aria-hidden /> {i.text}
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// 2 · The year's fees: this year, previous years, both together (not tied to the period)
// ---------------------------------------------------------------------------------------------

function FeePositionCard({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const res = useApi<FeePosition>(apiUrl("/api/analytics/position", { session: sessionId }));
  return (
    <HomeCard
      title={`Fees · ${sessionName}`}
      info={`${MONEY.balance.label} = ${MONEY.due_now.label.toLowerCase()} + ${MONEY.due_later.label.toLowerCase()}. ${MONEY.to_recover.label} = ${MONEY.due_now.label.toLowerCase()} + ${MONEY.old_balance.label.toLowerCase()}.`}
      query={res}
      lines={4}
    >
      {(f) => (
        <FeePositionFigures
          f={f}
          links={{
            total_fee: "/installments",
            received: "/payments?preset=session",
            balance: "/pending",
            due_now: "/pending?due=1",
            old_balance: "/pending?prev=1",
            balance_all: "/pending",
            to_recover: "/pending?due=1",
          }}
        />
      )}
    </HomeCard>
  );
}

// ---------------------------------------------------------------------------------------------
// 3 · What happened in the period: money in and where it came from, calls, activities (one read)
// ---------------------------------------------------------------------------------------------

const SOURCES = [
  { key: "calls", label: "After a call", className: "bg-series-1" },
  { key: "activities", label: "From an activity", className: "bg-series-3" },
  { key: "direct", label: "Paid on their own", className: "bg-series-track" },
] as const;

function PeriodCards({ period }: { period: Period }) {
  const res = useApi<RecoverySummary>(withParams("/api/recovery", { from: period.from, to: period.to }));
  const todayRes = useApi<HomeToday>("/api/home/today");
  const recoveryHref = withParams("/recovery", { period: period.key });
  return (
    <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[5fr_4fr_4fr]">
      <HomeCard title={`Money in · ${period.label}`} info="Receipts of the period, not counting cancelled ones, and what brought each in: the accountant ticks a call or an activity at the fee counter." query={res} lines={4}>
        {(d) => {
          const m = d.money;
          const change = m.prev_received > 0 ? ((m.received - m.prev_received) / m.prev_received) * 100 : null;
          return (
            <>
              <Link href={paymentsHref(period)} className="group block">
                <span className="figure block text-[40px] leading-none text-good-ink group-hover:underline">{rupeesShort(m.received)}</span>
                <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-subhead text-ink-2">
                  {m.receipts > 0 ? `${plural(m.receipts, "receipt")} · ${plural(m.families, "family", "families")}` : "No receipts yet"}
                  {change !== null && (
                    <span className={cn("inline-flex items-center gap-1 text-footnote font-medium", change >= 0 ? "text-good-ink" : "text-critical-ink")}>
                      {change >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
                      {change >= 0 ? "+" : ""}
                      {pct(change, 0)} vs {period.before}
                    </span>
                  )}
                </span>
              </Link>
              <p className="mt-4 text-caption font-medium text-ink-2">Where it came from</p>
              <div className="mt-2">
                <StackedBar
                  height="h-3"
                  segments={SOURCES.map((x) => ({ value: m.by_source[x.key].amount, className: x.className, label: x.label, display: rupees(m.by_source[x.key].amount) }))}
                />
              </div>
              <ul className="mt-3 space-y-1.5">
                {SOURCES.map((x) => (
                  <li key={x.key} className="flex items-center justify-between gap-3 text-subhead">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className={cn("size-2 rounded-full", x.className)} aria-hidden /> {x.label}
                    </span>
                    <span className="tabular">
                      <span className="font-semibold text-ink">{rupeesShort(m.by_source[x.key].amount)}</span>
                      <span className="ml-1.5 text-caption text-muted">{pct(ratioPct(m.by_source[x.key].amount, m.received), 0)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-caption text-ink-2">
                This year {rupeesShort(m.by_kind.current ?? 0)} · {MONEY.old_balance.label} {rupeesShort(m.by_kind.arrears ?? 0)} · {MONEY.advance.label}{" "}
                {rupeesShort(m.by_kind.advance ?? 0)}
              </p>
            </>
          );
        }}
      </HomeCard>

      <HomeCard title={`Calls · ${period.label}`} query={res} lines={4}>
        {(d) => {
          const c = d.calls;
          return (
            <>
              <Link href="/calls" className="group flex items-end gap-3">
                <span className="figure text-[40px] leading-none text-ink group-hover:underline">{num(c.calls)}</span>
                <span className="pb-1 text-subhead text-ink-2">
                  {c.calls === 1 ? "call" : "calls"} · {plural(c.families, "family", "families")}
                </span>
              </Link>
              <ul className="mt-4 divide-y divide-line">
                <Row href="/calls" label="Picked up" value={c.calls > 0 ? `${c.connected} · ${pct(ratioPct(c.connected, c.calls), 0)}` : "—"} />
                <Row href="/calls" label="Promised to pay" value={c.promises > 0 ? `${c.promises} · ${rupeesShort(c.promised_amount)}` : "None"} />
                <Row href={recoveryHref} label="Came in after calls" value={c.recovered > 0 ? `${rupeesShort(c.recovered)} · ${plural(c.families_paid, "family", "families")}` : "₹0"} tone={c.recovered > 0 ? "text-good-ink" : undefined} />
              </ul>
              <TodayList q={todayRes} />
            </>
          );
        }}
      </HomeCard>

      <HomeCard title="Activities" query={res} lines={4}>
        {(d) => {
          const a = d.activities;
          const top = a.list.filter((x) => x.recovered > 0).slice(0, 3);
          return (
            <>
              <Link href="/activities" className="group flex items-end gap-3">
                <span className="figure text-[40px] leading-none text-ink group-hover:underline">{num(a.running)}</span>
                <span className="pb-1 text-subhead text-ink-2">running · {plural(a.students, "student")} taking part</span>
              </Link>
              <ul className="mt-4 divide-y divide-line">
                <Row
                  href={recoveryHref}
                  label={`Received because of them · ${period.label.toLowerCase()}`}
                  value={rupeesShort(d.money.by_source.activities.amount)}
                  tone={d.money.by_source.activities.amount > 0 ? "text-good-ink" : undefined}
                />
                {a.starting > 0 && <Row href="/activities" label="Starting soon" value={num(a.starting)} />}
              </ul>
              {top.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {top.map((x) => (
                    <li key={x.id}>
                      <Link href={`/activities/${x.id}`} className="flex min-h-9 items-center justify-between gap-3 text-subhead hover:text-accent">
                        <span className="flex min-w-0 items-center gap-2 text-ink">
                          <Sparkles className="size-3.5 shrink-0 text-series-3" aria-hidden />
                          <span className="truncate">{x.name}</span>
                        </span>
                        <span className="shrink-0 font-semibold tabular text-ink">{rupeesShort(x.recovered)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </HomeCard>
    </div>
  );
}

/** Today's call list in one line (always today, whatever the period). */
function TodayList({ q }: { q: Query<HomeToday> }) {
  if (!q.data) return null;
  const t = q.data;
  return (
    <Link href="/calls" className="mt-3 flex min-h-11 items-center justify-between gap-2 rounded-xl bg-fill-2 px-3 py-2 text-footnote text-ink-2 hover:bg-fill">
      <span className="flex items-start gap-2">
        <PhoneCall className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span>
          Today&rsquo;s list: <b className="text-ink">{num(t.to_call)}</b> to call
          {t.broken > 0 && <span className="font-medium text-critical-ink"> · {plural(t.broken, "broken promise")}</span>}
          {t.promises_today > 0 && <> · {plural(t.promises_today, "promise")} due today</>}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

function Row({ href, label, value, tone }: { href: string; label: string; value: string; tone?: string }) {
  return (
    <li>
      <Link href={href} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-fill-2">
        <span className="text-subhead text-ink-2">{label}</span>
        <span className={cn("text-right text-subhead font-semibold tabular", tone ?? "text-ink")}>{value}</span>
      </Link>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------
// 4 · The school: students, families, classes, and students by status
// ---------------------------------------------------------------------------------------------

const STATUS_KEYS = ["paid_up", "partial", "not_paying", "arrears_only", "free"] as const;

function SchoolCard({ sessionId, sessionName }: { sessionId: string; sessionName: string }) {
  const res = useApi<HomeFees>(apiUrl("/api/home/fees", { session: sessionId }));
  return (
    <HomeCard title={`School · ${sessionName}`} info="Students enrolled this year and their fee status (the same tags as on every page)." query={res} lines={3}>
      {(f) => {
        const s = f.school;
        return (
          <>
            <Link href="/students" className="group flex items-end gap-3">
              <span className="figure text-[40px] leading-none text-ink group-hover:underline">{num(s.students)}</span>
              <span className="pb-1 text-subhead text-ink-2">
                students · {plural(s.families, "family", "families")} · {plural(s.classes, "class", "classes")}
              </span>
            </Link>
            <div className="mt-4">
              <StackedBar
                height="h-3"
                segments={STATUS_KEYS.map((k) => ({ value: s.status[k], className: STATUS_STYLE[k].bar, label: FEE_STATUS[k].label, display: num(s.status[k]) }))}
              />
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
              {STATUS_KEYS.filter((k) => s.status[k] > 0 || k !== "free").map((k) => (
                <li key={k}>
                  <Link href={k === "free" ? "/students" : withParams("/pending", { status: k })} className="flex min-h-9 items-center justify-between gap-2 text-subhead hover:text-accent" title={FEE_STATUS[k].hint}>
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className={cn("size-2 rounded-full", STATUS_STYLE[k].dot)} aria-hidden /> {FEE_STATUS[k].label}
                    </span>
                    <span className="font-semibold tabular text-ink">{num(s.status[k])}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </HomeCard>
  );
}

// ---------------------------------------------------------------------------------------------
// 5 · Classes: share of each class's total fees received
// ---------------------------------------------------------------------------------------------

const BANDS = [
  { min: 50, tile: "bg-good-soft", text: "text-good-ink", dot: "bg-good", label: "50% and above" },
  { min: 30, tile: "bg-warning-soft", text: "text-warning-ink", dot: "bg-warning", label: "30–49%" },
  { min: -1, tile: "bg-critical-soft", text: "text-critical-ink", dot: "bg-critical", label: "Under 30%" },
];
const band = (pct: number | null) => BANDS.find((b) => (pct ?? 0) >= b.min) ?? BANDS[2];

function ClassesCard({ sessionId }: { sessionId: string }) {
  const res = useApi<HomeClass[]>(apiUrl("/api/home/classes", { session: sessionId }));
  return (
    <HomeCard title="Classes" info="Share of each class's total fees this year that has been received, and what is due till today. Tap a class for its list of fees due." query={res} lines={3}>
      {(rows) =>
        rows.length === 0 ? (
          <p className="text-subhead text-ink-2">No students are enrolled yet.</p>
        ) : (
          <>
            <ul className="grid grid-cols-5 gap-2">
              {rows.map((c) => {
                const b = band(c.received_pct);
                return (
                  <li key={c.class_id}>
                    <Link
                      href={`/pending?class=${c.class_id}`}
                      className={cn("flex min-h-[64px] flex-col justify-center rounded-xl px-2 py-2 text-center transition-transform hover:-translate-y-0.5", b.tile)}
                      title={`${c.class_name}: ${c.received_pct ?? 0}% of ${rupeesShort(c.total_fee)} received · ${rupeesShort(c.due_now)} due till today`}
                    >
                      <span className="truncate text-caption text-ink-2">
                        <span className="sm:hidden">{c.class_name.replace(/^Class /, "")}</span>
                        <span className="hidden sm:inline">{c.class_name}</span>
                      </span>
                      <span className={cn("text-headline font-semibold tabular", b.text)}>{c.received_pct ?? 0}%</span>
                      <span className="hidden truncate text-caption tabular text-ink-2 sm:block">
                        {rupeesShort(c.received)} of {rupeesShort(c.total_fee)}
                      </span>
                      {c.due_now > 0 && <span className="hidden truncate text-caption tabular text-critical-ink sm:block">{rupeesShort(c.due_now)} due</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
              <span>% of total fees received:</span>
              {BANDS.map((b) => (
                <span key={b.label} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", b.dot)} aria-hidden /> {b.label}
                </span>
              ))}
            </p>
          </>
        )
      }
    </HomeCard>
  );
}
