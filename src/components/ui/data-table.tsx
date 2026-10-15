"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { MODE_LABELS, fmtDate, num, pct, rupees } from "@/lib/format";
import { AllocLines, allocText } from "@/components/ui/alloc";
import { FEE_STATUS, FeeStatusBadge, PAY_STATUS_LABELS, PayStatusBadge } from "@/components/ui/status";
import { Avatar } from "@/components/ui/avatar";
import type { AllocationLine, FeeStatus } from "@/lib/types";

export type ColumnType =
  | "person"
  | "action"
  | "text"
  | "money"
  | "pct"
  | "number"
  | "date"
  | "status"
  | "paystatus"
  | "alloc"
  | "mode";

export interface Column {
  key: string;
  label: string;
  type?: ColumnType;
  /** Link template, e.g. "/students/{student_id}" */
  href?: string;
  /** Secondary field rendered under the value (text) */
  sub?: string;
  align?: "left" | "right";
  sortable?: boolean;
  /** Include in the totals row (money / number) */
  total?: boolean;
  hideOnMobile?: boolean;
  /** Muted when value is zero */
  dimZero?: boolean;
  /** Emphasise (critical ink) when value > 0 */
  alertPositive?: boolean;
  className?: string;
}

export interface FilterDef {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

type Row = Record<string, unknown>;

function fill(template: string, row: Row) {
  return template.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(String(row[k] ?? "")));
}

function cellText(col: Column, row: Row): string {
  const v = row[col.key];
  switch (col.type) {
    case "money":
      return v === null || v === undefined ? "" : String(Number(v) / 100);
    case "pct":
      return v === null || v === undefined ? "" : String(v);
    case "date":
      return v ? String(v).slice(0, 10) : "";
    case "status":
      return v ? FEE_STATUS[v as FeeStatus]?.label ?? String(v) : "";
    case "paystatus":
      return v ? PAY_STATUS_LABELS[String(v)] ?? String(v) : "";
    case "mode":
      return v ? MODE_LABELS[String(v)] ?? String(v) : "";
    case "alloc":
      return Array.isArray(v) ? (v as AllocationLine[]).map(allocText).join("; ") : "";
    default:
      return v === null || v === undefined ? "" : String(v);
  }
}

function Cell({ col, row }: { col: Column; row: Row }) {
  const v = row[col.key];
  let content: React.ReactNode;
  switch (col.type) {
    case "money": {
      const n = v === null || v === undefined ? null : Number(v);
      content = (
        <span
          className={
            col.alertPositive && n !== null && n > 0
              ? "font-semibold text-critical-ink"
              : col.dimZero && n === 0
                ? "text-muted"
                : "font-medium text-ink"
          }
        >
          {n === null ? "—" : rupees(n)}
        </span>
      );
      break;
    }
    case "pct":
      content = pct(v as number | null);
      break;
    case "number":
      content = <span className={cn(col.dimZero && Number(v) === 0 && "text-muted")}>{num(v as number)}</span>;
      break;
    case "date":
      content = fmtDate(v as string | null);
      break;
    case "status":
      content = <FeeStatusBadge status={v as FeeStatus} />;
      break;
    case "paystatus":
      content = v ? <PayStatusBadge status={v as "paid"} /> : null;
      break;
    case "mode":
      content = v ? MODE_LABELS[String(v)] ?? String(v) : "—";
      break;
    case "alloc":
      content = <AllocLines lines={(v as AllocationLine[]) ?? []} compact />;
      break;
    case "action":
      return col.href ? (
        <Link
          href={fill(col.href, row)}
          className="inline-flex h-7 items-center rounded-full bg-accent-soft px-3 text-caption font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-ink"
        >
          {String(v ?? col.label)}
        </Link>
      ) : null;
    case "person": {
      const name = String(v ?? "");
      const sub = col.sub ? row[col.sub] : null;
      const inner = (
        <span className="flex items-center gap-3">
          <Avatar name={name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{name}</span>
            {sub !== null && sub !== undefined && sub !== "" && <span className="block truncate text-caption text-muted">{String(sub)}</span>}
          </span>
        </span>
      );
      return col.href ? (
        <Link href={fill(col.href, row)} className="group/p block rounded-lg [&_span.font-medium]:group-hover/p:text-accent">
          {inner}
        </Link>
      ) : (
        inner
      );
    }
    default:
      content = v === null || v === undefined || v === "" ? <span className="text-muted">—</span> : String(v);
  }
  const sub = col.sub ? row[col.sub] : null;
  const inner = (
    <>
      {content}
      {sub !== null && sub !== undefined && sub !== "" && <span className="block text-caption font-normal text-muted">{String(sub)}</span>}
    </>
  );
  if (col.href) {
    return (
      <Link href={fill(col.href, row)} className="font-medium text-ink transition-colors hover:text-accent">
        {inner}
      </Link>
    );
  }
  return inner;
}

const numericTypes: ColumnType[] = ["money", "pct", "number"];

export function DataTable({
  columns,
  rows,
  searchKeys,
  searchPlaceholder = "Search…",
  defaultSort,
  pageSize = 50,
  exportName,
  exportMeta = [],
  filters = [],
  totals = false,
  empty = "Nothing to show",
  dense = false,
  toolbar,
}: {
  columns: Column[];
  rows: Row[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  exportName?: string;
  exportMeta?: string[];
  filters?: FilterDef[];
  totals?: boolean;
  empty?: string;
  dense?: boolean;
  toolbar?: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      for (const [k, v] of Object.entries(active)) {
        if (v && String(r[k] ?? "") !== v) return false;
      }
      if (!needle || !searchKeys?.length) return true;
      return searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle));
    });
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      const numeric = col && numericTypes.includes(col.type ?? "text");
      out = [...out].sort((a, b) => {
        const av = a[sort.key];
        const bv = b[sort.key];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const cmp = numeric
          ? Number(av) - Number(bv)
          : String(av).localeCompare(String(bv), "en-IN", { numeric: true, sensitivity: "base" });
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return out;
  }, [rows, q, sort, active, columns, searchKeys]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * pageSize, current * pageSize + pageSize);

  const totalRow = useMemo(() => {
    if (!totals) return null;
    const t: Record<string, number> = {};
    for (const c of columns) {
      if (!c.total) continue;
      t[c.key] = filtered.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    }
    return t;
  }, [totals, columns, filtered]);

  function toggleSort(key: string) {
    setPage(0);
    setSort((s) => (s?.key === key ? (s.dir === "desc" ? { key, dir: "asc" } : null) : { key, dir: "desc" }));
  }

  function exportCsv() {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines: string[] = [];
    for (const m of exportMeta) lines.push(esc(`# ${m}`));
    const filterNotes = Object.entries(active)
      .filter(([, v]) => v)
      .map(([k, v]) => `${filters.find((f) => f.key === k)?.label ?? k}=${filters.find((f) => f.key === k)?.options.find((o) => o.value === v)?.label ?? v}`);
    if (q) filterNotes.push(`search="${q}"`);
    if (filterNotes.length) lines.push(esc(`# Filters: ${filterNotes.join(", ")}`));
    lines.push(esc(`# Exported ${new Date().toLocaleString("en-IN")} · amounts in rupees`));
    const cols = columns.filter((c) => c.type !== "action");
    lines.push(cols.map((c) => esc(c.label + (c.type === "money" ? " (₹)" : c.type === "pct" ? " (%)" : ""))).join(","));
    for (const r of filtered) lines.push(cols.map((c) => esc(cellText(c, r))).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showToolbar = searchKeys?.length || filters.length || exportName || toolbar;
  const isRight = (c: Column) => c.align === "right" || (c.align === undefined && numericTypes.includes(c.type ?? "text"));

  return (
    <div>
      {showToolbar && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          {searchKeys?.length ? (
            <label className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label="Search table"
                className="h-9 w-full rounded-full bg-fill-2 pl-9 pr-3 text-subhead text-ink placeholder:text-muted transition-colors hover:bg-fill focus:bg-surface focus:outline-none focus:ring-4 focus:ring-accent/15"
              />
            </label>
          ) : null}
          {filters.map((f) => (
            <select
              key={f.key}
              aria-label={f.label}
              value={active[f.key] ?? ""}
              onChange={(e) => {
                setActive((a) => ({ ...a, [f.key]: e.target.value }));
                setPage(0);
              }}
              className={cn(
                "h-9 rounded-full px-3.5 pr-8 text-subhead font-medium focus:outline-none focus:ring-4 focus:ring-accent/15",
                active[f.key] ? "bg-accent-soft text-accent" : "bg-fill-2 text-ink hover:bg-fill",
              )}
            >
              <option value="">{f.label}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {toolbar}
          <span className="ml-auto text-footnote text-muted tabular">
            {filtered.length === rows.length ? `${rows.length}` : `${filtered.length} of ${rows.length}`}
          </span>
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              title="Download CSV (opens in Excel)"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill-2 px-3.5 text-subhead font-medium text-ink transition-colors hover:bg-fill"
            >
              <Download className="size-4" aria-hidden /> Export
            </button>
          )}
        </div>
      )}
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full border-collapse text-left text-subhead">
          <thead className="text-footnote text-muted">
            <tr>
              {columns.map((c, ci) => {
                const right = isRight(c);
                const sortable = c.sortable !== false && c.type !== "alloc" && c.type !== "action";
                const isSorted = sort?.key === c.key;
                return (
                  <th
                    key={c.key + ci}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap border-b border-line px-3 pb-2.5 pt-1 font-medium first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                      right && "text-right",
                      c.hideOnMobile && "hidden md:table-cell",
                    )}
                    aria-sort={isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable && c.label ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn("inline-flex items-center gap-1 transition-colors hover:text-ink", isSorted && "text-ink", right && "flex-row-reverse")}
                      >
                        {c.label}
                        {isSorted && (sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="tabular">
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-subhead text-muted">
                  {empty}
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <tr
                key={String(r.payment_id ?? r.id ?? (r.student_id ? `${r.student_id}:${i}` : i))}
                className="group/row align-middle transition-colors hover:bg-fill-2"
              >
                {columns.map((c, ci) => (
                  <td
                    key={c.key + ci}
                    className={cn(
                      "border-b border-line px-3 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                      dense ? "py-2" : "py-3",
                      isRight(c) && "whitespace-nowrap text-right",
                      c.type === "alloc" && "min-w-[240px]",
                      c.type === "person" && "min-w-[200px]",
                      (c.type === "status" || c.type === "paystatus" || c.type === "date" || c.type === "action") && "whitespace-nowrap",
                      c.hideOnMobile && "hidden md:table-cell",
                      c.className,
                    )}
                  >
                    <Cell col={c} row={r} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totalRow && visible.length > 0 && (
            <tfoot className="tabular">
              <tr className="font-semibold text-ink">
                {columns.map((c, i) => (
                  <td
                    key={c.key + i}
                    className={cn(
                      "px-3 pb-1 pt-3.5 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
                      isRight(c) && "whitespace-nowrap text-right",
                      c.hideOnMobile && "hidden md:table-cell",
                    )}
                  >
                    {i === 0
                      ? `Total · ${filtered.length}`
                      : c.key in totalRow
                        ? c.type === "money"
                          ? rupees(totalRow[c.key])
                          : num(totalRow[c.key])
                        : ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="no-print mt-4 flex items-center justify-end gap-1 text-footnote text-ink-2">
          <span className="mr-2 tabular">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label="Previous page"
            className="inline-flex size-8 items-center justify-center rounded-full bg-fill-2 transition-colors hover:bg-fill disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label="Next page"
            className="inline-flex size-8 items-center justify-center rounded-full bg-fill-2 transition-colors hover:bg-fill disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
