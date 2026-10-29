"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { rupeesShort } from "@/lib/format";
import { MONEY, type MoneyWord } from "@/lib/glossary";
import { plural } from "@/lib/text";
import type { FeePosition } from "@/lib/types";
import { Legend } from "@/components/ui/bars";

type Shown = "total_fee" | "received" | "balance" | "due_now" | "old_balance" | "total_fee_all" | "balance_all" | "to_recover";

/**
 * Every total of the year in two rows, each figure named so it reads on its own: this year's fees (total, received,
 * remaining, due till today) with a bar, then the same including previous years (what is still unpaid from previous
 * years, the total fees and what remains with them, and everything due till today). `links` opens the page behind
 * a figure. The numbers come from fee_position().
 */
export function FeePositionFigures({ f, links = {} }: { f: FeePosition; links?: Partial<Record<Shown, string>> }) {
  const part = (v: number) => (f.total_fee > 0 ? `${Math.max(0, (100 * v) / f.total_fee)}%` : "0%");
  return (
    <div className="space-y-4">
      <Row title="This year">
        <Tile word="total_fee" value={f.total_fee} href={links.total_fee} sub="after concessions" />
        <Tile
          word="received"
          value={f.received}
          href={links.received}
          sub={f.received_pct !== null ? `${f.received_pct}% of total fees this year` : "nothing to receive"}
          tone="text-good-ink"
        />
        <Tile word="balance" value={f.balance} href={links.balance} sub={`${rupeesShort(f.due_now)} due till today + ${rupeesShort(f.due_later)} due later`} />
        <Tile
          word="due_now"
          value={f.due_now}
          href={links.due_now}
          sub={f.due_so_far > 0 ? `of ${rupeesShort(f.due_so_far)} due so far · ${f.due_received_pct ?? 0}% of it received` : "nothing due yet"}
          tone={f.due_now > 0 ? "text-critical-ink" : "text-good-ink"}
        />
      </Row>

      <div>
        <div className="flex h-3 overflow-hidden rounded-full bg-fill" aria-hidden>
          <span className="h-full bg-good" style={{ width: part(f.received) }} />
          <span className="h-full border-l-2 border-surface bg-critical" style={{ width: part(f.due_now) }} />
          <span className="h-full border-l-2 border-surface bg-warning" style={{ width: part(f.due_later) }} />
        </div>
        <Legend
          className="mt-2.5"
          items={[
            { label: MONEY.received.label, className: "bg-good", value: rupeesShort(f.received) },
            { label: MONEY.due_now.label, className: "bg-critical", value: rupeesShort(f.due_now) },
            { label: MONEY.due_later.label, className: "bg-warning", value: rupeesShort(f.due_later) },
          ]}
        />
      </div>

      <Row title="Including previous years">
        <Tile
          word="old_balance"
          value={f.old_balance}
          href={links.old_balance}
          sub={f.old_opening > 0 ? `${rupeesShort(f.old_opening)} when the year started · ${rupeesShort(f.old_received)} received` : "nothing left from previous years"}
          tone={f.old_balance > 0 ? "text-serious-ink" : undefined}
        />
        <Tile word="total_fee_all" value={f.total_fee_all} href={links.total_fee_all} sub={`this year + ${rupeesShort(f.old_opening)} from previous years`} />
        <Tile word="balance_all" value={f.balance_all} href={links.balance_all} sub={`remaining this year + ${rupeesShort(f.old_balance)} previous years`} />
        <Tile
          word="to_recover"
          value={f.to_recover}
          href={links.to_recover}
          sub={`due till today + previous years · ${plural(f.students_due, "student")}`}
          tone={f.to_recover > 0 ? "text-critical-ink" : "text-good-ink"}
          strong={f.to_recover > 0}
        />
      </Row>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-caption font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{children}</div>
    </section>
  );
}

function Tile({ word, value, sub, href, tone, strong }: { word: MoneyWord; value: number; sub: string; href?: string; tone?: string; strong?: boolean }) {
  const body = (
    <>
      <span className="block text-footnote font-medium text-ink-2">{MONEY[word].label}</span>
      <span className={cn("figure mt-1 block text-title2", tone ?? "text-ink")}>{rupeesShort(value)}</span>
      <span className="mt-0.5 block text-caption text-muted">{sub}</span>
    </>
  );
  const box = cn("block min-h-11 rounded-2xl px-3.5 py-3", strong ? "bg-critical-soft" : "bg-fill-2");
  return href ? (
    <Link href={href} title={MONEY[word].hint} className={cn(box, "transition-colors hover:bg-fill")}>
      {body}
    </Link>
  ) : (
    <div title={MONEY[word].hint} className={box}>
      {body}
    </div>
  );
}
