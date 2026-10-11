"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { MODE_LABELS, fmtDate, num, pct, rupees } from "@/lib/format";
import { AllocLines, allocText } from "@/components/ui/alloc";
import { FEE_STATUS, FeeStatusBadge, PAY_STATUS_LABELS, PayStatusBadge } from "@/components/ui/status";
import type { AllocationLine, FeeStatus } from "@/lib/types";

export type ColumnType =
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
        <span className={cn(col.dimZero && n === 0 && "text-muted", col.alertPositive && n !== null && n > 0 && "font-medium text-critical-ink")}>
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
    default:
      content = v === null || v === undefined || v === "" ? <span className="text-muted">—</span> : String(v);
  }
  const sub = col.sub ? row[col.sub] : null;
  const inner = (
    <>
      {content}
      {sub !== null && sub !== undefined && sub !== "" && <span className="block text-[12px] font-normal text-muted">{String(sub)}</span>}
    </>
  );
  if (col.href) {
    return (
      <Link href={fill(col.href, row)} className="font-medium text-ink hover:text-accent hover:underline">
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
    lines.push(columns.map((c) => esc(c.label + (c.type === "money" ? " (₹)" : c.type === "pct" ? " (%)" : ""))).join(","));
    for (const r of filtered) lines.push(columns.map((c) => esc(cellText(c, r))).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const showToolbar = searchKeys?.length || filters.length || exportName || toolbar;

  return (
    <div>
      {showToolbar && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          {searchKeys?.length ? (
            <label className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                aria-label="Search table"
                className="h-9 w-full rounded-lg border border-line-strong bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
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
              className="h-9 rounded-lg border border-line-strong bg-surface px-2.5 pr-8 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}
          {toolbar}
          <span className="ml-auto text-[12.5px] text-muted">
            {filtered.length === rows.length ? `${rows.length} rows` : `${filtered.length} of ${rows.length} rows`}
          </span>
          {exportName && (
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-surface-2"
            >
              <Download className="size-4" aria-hidden /> CSV
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <thead className="bg-surface-2 text-[12px] uppercase tracking-wide text-muted">
            <tr>
              {columns.map((c) => {
                const right = c.align === "right" || (c.align === undefined && numericTypes.includes(c.type ?? "text"));
                const sortable = c.sortable !== false && c.type !== "alloc";
                const isSorted = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn("whitespace-nowrap px-3 py-2 font-medium", right && "text-right", c.hideOnMobile && "hidden md:table-cell")}
                    aria-sort={isSorted ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={cn("inline-flex items-center gap-1 uppercase hover:text-ink", right && "flex-row-reverse")}
                      >
                        {c.label}
                        {isSorted ? (
                          sort!.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="no-print size-3 opacity-40" />
                        )}
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
                <td colSpan={columns.length} className="px-3 py-8 text-center text-ink-2">
                  {empty}
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <tr key={String(r.payment_id ?? r.id ?? (r.student_id ? `${r.student_id}:${i}` : i))} className="border-t border-line align-top hover:bg-surface-2/60">
                {columns.map((c) => {
                  const right = c.align === "right" || (c.align === undefined && numericTypes.includes(c.type ?? "text"));
                  return (
                    <td
                      key={c.key}
                      className={cn(
                        dense ? "px-3 py-1.5" : "px-3 py-2",
                        right && "text-right whitespace-nowrap",
                        c.type === "alloc" && "min-w-[240px]",
                        (c.type === "status" || c.type === "paystatus" || c.type === "date") && "whitespace-nowrap",
                        c.hideOnMobile && "hidden md:table-cell",
                        c.className,
                      )}
                    >
                      <Cell col={c} row={r} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {totalRow && visible.length > 0 && (
            <tfoot className="tabular">
              <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold">
                {columns.map((c, i) => {
                  const right = c.align === "right" || (c.align === undefined && numericTypes.includes(c.type ?? "text"));
                  return (
                    <td key={c.key} className={cn("px-3 py-2", right && "text-right whitespace-nowrap", c.hideOnMobile && "hidden md:table-cell")}>
                      {i === 0
                        ? `Total (${filtered.length})`
                        : c.key in totalRow
                          ? c.type === "money"
                            ? rupees(totalRow[c.key])
                            : num(totalRow[c.key])
                          : ""}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {pages > 1 && (
        <div className="no-print mt-3 flex items-center justify-end gap-2 text-[13px] text-ink-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
