"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, IndianRupee, RotateCw } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { fmtDate, num, rupees, rupeesShort } from "@/lib/format";
import { MONEY } from "@/lib/glossary";
import { REASON_LABELS } from "@/lib/recovery";
import { plural } from "@/lib/text";
import type { HomeChase, HomeClass, HomeFees, HomeToday, SetupChecklist } from "@/lib/types";
import { useApp } from "@/components/layout/app-shell";
import { NoSession } from "@/components/no-session";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";

type Query<T> = { data?: T; error?: Error; mutate: () => unknown };

const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "UTC" });

/**
 * Home: how much came in, how much is due, and what to do today, read in a few seconds. Every number opens the
 * page that explains it. Each card loads (and fails) on its own.
 */
export function HomeView() {
  const { session, writer, settings } = useApp();
  if (!session) return <NoSession />;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: settings.timezone || "Asia/Kolkata" });
  const past = session.end_date < today;

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

      <div className={cn("grid grid-cols-1 gap-5", past ? "min-[900px]:grid-cols-[5fr_4fr]" : "min-[900px]:grid-cols-[5fr_4fr_4fr]")}>
        <FeesCards sessionId={session.id} />
        {past ? null : <TodayCard />}
      </div>

      <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-[2fr_3fr]">
        <ChaseFirst />
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
// 2 · This year's fees and 3 · To recover now (one read)
// ---------------------------------------------------------------------------------------------

function FeesCards({ sessionId }: { sessionId: string }) {
  const res = useApi<HomeFees>(apiUrl("/api/home/fees", { session: sessionId }));
  return (
    <>
      <HomeCard title="This year's fees" info={`${MONEY.total_fee.label}: ${MONEY.total_fee.hint}.`} query={res} lines={4}>
        {(f) => {
          const part = (v: number) => (f.total_fee > 0 ? `${Math.max(0, (100 * v) / f.total_fee)}%` : "0%");
          return (
            <>
              <Link href="/payments?preset=session" className="group block">
                <span className="figure block text-[40px] leading-none text-good-ink group-hover:underline">{rupeesShort(f.received)}</span>
                <span className="mt-2 block text-subhead text-ink-2">
                  {MONEY.received.label} · of {rupeesShort(f.total_fee)} total fee{f.received_pct !== null ? ` · ${f.received_pct}%` : ""}
                </span>
              </Link>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-fill" aria-hidden>
                <span className="h-full bg-good" style={{ width: part(f.received) }} />
                <span className="h-full border-l-2 border-surface bg-critical" style={{ width: part(f.due_now) }} />
                <span className="h-full border-l-2 border-surface bg-warning" style={{ width: part(f.due_later) }} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Figure href="/payments?preset=session" dot="bg-good" word="received" value={f.received} />
                <Figure href="/pending?due=1" dot="bg-critical" word="due_now" value={f.due_now} tone="text-critical-ink" />
                <Figure href="/installments" dot="bg-warning" word="due_later" value={f.due_later} />
              </dl>
              {(f.old_balance > 0 || f.old_balance_received > 0) && (
                <Link
                  href="/pending?arrears=1&prev=1"
                  className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-xl bg-serious-soft px-3 py-2 text-subhead text-ink hover:underline"
                >
                  <span>
                    <span className="font-medium text-serious-ink">{MONEY.old_balance.label}:</span> {rupeesShort(f.old_balance)} left ·{" "}
                    {rupeesShort(f.old_balance_received)} received
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              )}
            </>
          );
        }}
      </HomeCard>

      <HomeCard title="To recover now" info={`${MONEY.to_recover.label} = ${MONEY.due_now.label} + ${MONEY.old_balance.label}.`} query={res} lines={2}>
        {(f) => (
          <Link href="/pending?due=1&arrears=1" className="group block">
            <span className="figure block text-[40px] leading-none text-critical-ink group-hover:underline">{rupeesShort(f.to_recover)}</span>
            <span className="mt-2 block text-subhead text-ink-2">
              {f.old_balance > 0 ? (
                <>
                  {rupeesShort(f.due_now)} due now this year + {rupeesShort(f.old_balance)} old balance
                </>
              ) : (
                <>{rupeesShort(f.due_now)} due now this year</>
              )}
            </span>
            <span className="mt-3 block text-subhead text-ink">
              {plural(f.students_to_recover, "student")} · {num(f.nothing_paid)} nothing paid this year
            </span>
            <span className="mt-4 inline-flex items-center gap-1 text-footnote font-medium text-accent">
              See the list <ChevronRight className="size-3.5" aria-hidden />
            </span>
          </Link>
        )}
      </HomeCard>
    </>
  );
}

function Figure({ href, dot, word, value, tone }: { href: string; dot: string; word: "received" | "due_now" | "due_later"; value: number; tone?: string }) {
  return (
    <Link href={href} className="min-h-11 rounded-xl px-1 py-1 hover:bg-fill-2" title={MONEY[word].hint}>
      <dt className="flex items-center gap-1.5 text-caption text-ink-2">
        <span className={cn("size-2 rounded-full", dot)} aria-hidden /> {MONEY[word].label}
      </dt>
      <dd className={cn("mt-0.5 text-headline font-semibold tabular", tone ?? "text-ink")}>{rupeesShort(value)}</dd>
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------
// 4 · Today
// ---------------------------------------------------------------------------------------------

function TodayCard() {
  const res = useApi<HomeToday>("/api/home/today");
  return (
    <HomeCard title="Today" query={res} lines={4}>
      {(t) => (
        <ul className="divide-y divide-line">
          <Row
            href="/payments?preset=today"
            label="Received today"
            value={t.receipts_today > 0 ? `${rupees(t.received_today)} · ${plural(t.receipts_today, "receipt")}` : "₹0 · no receipts yet"}
          />
          <Row href="/monthly" label="Received this month" value={`${rupeesShort(t.received_month)} · ${plural(t.receipts_month, "receipt")}`} />
          <Row href="/calls" label="Families to call today" value={num(t.to_call)} />
          <Row href="/calls" label="Promises due today" value={t.promises_today > 0 ? `${t.promises_today} · ${rupeesShort(t.promised_today)}` : "None"} />
          <Row href="/calls" label="Broken promises" value={t.broken > 0 ? num(t.broken) : "None"} tone={t.broken > 0 ? "text-critical-ink" : undefined} />
        </ul>
      )}
    </HomeCard>
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
// 5 · Chase first: the first five families of today's call list
// ---------------------------------------------------------------------------------------------

function ChaseFirst() {
  const res = useApi<HomeChase>("/api/home/chase");
  return (
    <HomeCard title="Chase first" info="The top of today's call list, in the same order as the Calls page. The amount is the family's Due now + Old balance." query={res} lines={5}>
      {(c) =>
        c.rows.length === 0 ? (
          <p className="text-subhead text-ink-2">No families on today&rsquo;s call list.</p>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {c.rows.map((r) => (
                <li key={r.parent_id}>
                  <Link href={`/calls/${r.parent_id}`} className="flex min-h-11 items-center gap-3 py-2.5 hover:bg-fill-2">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-subhead font-semibold text-ink">{r.name}</span>
                        {r.reason && <Badge tone={REASON_LABELS[r.reason].tone}>{REASON_LABELS[r.reason].label}</Badge>}
                      </span>
                      <span className="block truncate text-footnote text-ink-2">
                        {r.child}
                        {r.class_name ? ` · ${r.class_name}` : ""}
                        {r.more_children > 0 ? ` +${r.more_children}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-subhead font-semibold tabular text-critical-ink">{rupeesShort(r.to_recover)}</span>
                      <span className="block text-caption text-muted">to recover</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/calls" className="mt-3 inline-flex min-h-11 items-center gap-1 text-subhead font-medium text-accent">
              See all {num(c.total)} <ChevronRight className="size-4" aria-hidden />
            </Link>
          </>
        )
      }
    </HomeCard>
  );
}

// ---------------------------------------------------------------------------------------------
// 6 · Classes: share of each class's Total fee received
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
    <HomeCard title="Classes" info="Share of each class's Total fee received this year. Tap a class for its list of fees due." query={res} lines={3}>
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
                      title={`${c.class_name}: ${c.received_pct ?? 0}% of ${rupeesShort(c.total_fee)} received`}
                    >
                      <span className="truncate text-caption text-ink-2">
                        <span className="sm:hidden">{c.class_name.replace(/^Class /, "")}</span>
                        <span className="hidden sm:inline">{c.class_name}</span>
                      </span>
                      <span className={cn("text-headline font-semibold tabular", b.text)}>{c.received_pct ?? 0}%</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
              <span>% of total fee received:</span>
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
