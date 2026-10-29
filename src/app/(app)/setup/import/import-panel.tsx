"use client";

import { useState } from "react";
import Papa from "papaparse";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FormError, Select } from "@/components/ui/form";
import { listJoin, plural } from "@/lib/text";
import { IMPORT_SPECS, emptySummary, normalizeHeader, type ImportKind, type ImportSummary } from "@/lib/import-columns";
import { importChunk } from "./actions";

type Parsed = { fileName: string; headers: string[]; rows: Record<string, string>[]; parseErrors: number };

const MAX_ROWS = 1000;
const MAX_BYTES = 750_000; // keep each request small (one chunk = one database transaction)

function chunkRows(rows: Record<string, string>[]): Record<string, string>[][] {
  const enc = new TextEncoder();
  const out: Record<string, string>[][] = [];
  let cur: Record<string, string>[] = [];
  let bytes = 2;
  for (const r of rows) {
    const b = enc.encode(JSON.stringify(r)).length + 1;
    if (cur.length && (cur.length >= MAX_ROWS || bytes + b > MAX_BYTES)) {
      out.push(cur);
      cur = [];
      bytes = 2;
    }
    cur.push(r);
    bytes += b;
  }
  if (cur.length) out.push(cur);
  return out;
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Values in `col` that are not in `known` (case-insensitive unless exact), with how many rows use each. */
function unknownValues(rows: Record<string, string>[], col: string, known: string[], exact = false): { value: string; rows: number }[] {
  const norm = (s: string) => (exact ? s.trim() : s.trim().toLowerCase());
  const set = new Set(known.map(norm));
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v || set.has(norm(v))) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, n]) => ({ value, rows: n })).sort((a, b) => b.rows - a.rows);
}

export function ImportPanel({
  kind,
  sessions,
  activeSessionId,
  classNames,
  headNames,
}: {
  kind: ImportKind;
  sessions: { id: string; name: string }[];
  activeSessionId: string | null;
  classNames: string[];
  headNames: string[];
}) {
  const spec = IMPORT_SPECS[kind];
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [sessionId, setSessionId] = useState(activeSessionId ?? "");
  const [generate, setGenerate] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const known = spec.columns.map((c) => c.key);
  const present = parsed ? known.filter((k) => parsed.headers.includes(k)) : [];
  const ignored = parsed ? parsed.headers.filter((h) => h && !known.includes(h)) : [];
  const missing = parsed ? spec.columns.filter((c) => c.required && !parsed.headers.includes(c.key)).map((c) => c.key) : [];
  const blankRequired = parsed && missing.length === 0
    ? parsed.rows.filter((r) => spec.columns.some((c) => c.required && !(r[c.key] ?? "").trim())).length
    : 0;

  const warnings: React.ReactNode[] = [];
  if (parsed && missing.length === 0) {
    const sessionNames = sessions.map((s) => s.name);
    const fmt = (list: { value: string; rows: number }[]) => listJoin(list.map((u) => `“${u.value}” (${plural(u.rows, "row")})`), 5);
    if ((kind === "students" || kind === "dues") && present.includes("class")) {
      const u = unknownValues(parsed.rows, "class", classNames);
      if (u.length) warnings.push(<>Unknown classes {fmt(u)}: these rows will fail. Add the classes first or fix the names.</>);
    }
    if ((kind === "dues" || kind === "payments") && present.includes("session")) {
      const u = unknownValues(parsed.rows, "session", sessionNames, true);
      if (u.length) warnings.push(<>Unknown sessions {fmt(u)}: these rows will fail. Session names must match exactly, e.g. {sessionNames[0] ?? "2025-26"}.</>);
    }
    if (kind === "payments" && present.includes("fee_head")) {
      const u = unknownValues(parsed.rows, "fee_head", headNames);
      if (u.length) warnings.push(<>Unknown fee types {fmt(u)}: these rows will fail.</>);
    }
    if (kind === "dues" && present.includes("fee_head")) {
      const u = unknownValues(parsed.rows, "fee_head", headNames);
      if (u.length) warnings.push(<>New fee types {fmt(u)} will be created with priority 0 (cleared first).</>);
    }
    if (blankRequired) warnings.push(<>{plural(blankRequired, "row has", "rows have")} an empty required cell and will be reported as errors.</>);
    if (parsed.parseErrors) warnings.push(<>{plural(parsed.parseErrors, "line")} could not be read cleanly (check for stray quotes or extra commas).</>);
  }

  function reset() {
    setParsed(null);
    setFileError(null);
    setResult(null);
    setRunError(null);
    setInputKey((k) => k + 1);
  }

  function onFile(file: File | undefined) {
    setResult(null);
    setRunError(null);
    setFileError(null);
    setParsed(null);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => normalizeHeader(h),
      complete: (res) => {
        const headers = (res.meta.fields ?? []).filter(Boolean);
        if (headers.length === 0 || res.data.length === 0) {
          setFileError("The file has no rows. The first line must be the column names, followed by one row per record.");
          return;
        }
        setParsed({ fileName: file.name, headers, rows: res.data, parseErrors: res.errors.length });
      },
      error: (err) => setFileError(`Could not read the file: ${err.message}`),
    });
  }

  function downloadTemplate() {
    const csv = Papa.unparse({ fields: known, data: spec.example.map((r) => known.map((k) => r[k] ?? "")) });
    downloadCsv(`${kind}-template.csv`, csv);
  }

  function downloadErrors() {
    if (!result) return;
    const csv = Papa.unparse({ fields: ["line", "admission_no", "problem"], data: result.errors.map((e) => [e.line, e.admission_no, e.message]) });
    downloadCsv(`${kind}-import-errors.csv`, csv);
  }

  async function run() {
    if (!parsed || missing.length) return;
    const target = kind === "students" ? (sessionId ? sessions.find((s) => s.id === sessionId)?.name : null) : null;
    const question =
      kind === "students"
        ? `Import ${plural(parsed.rows.length, "student row")}${target ? ` and enrol them in ${target}` : " (no enrolment)"}?`
        : kind === "dues"
          ? `Add previous years' dues from ${plural(parsed.rows.length, "row")}? Importing the same file twice adds it twice.`
          : `Import ${plural(parsed.rows.length, "payment")}?`;
    if (!window.confirm(question)) return;

    const slim = parsed.rows.map((r) => Object.fromEntries(present.map((k) => [k, String(r[k] ?? "")])));
    const chunks = chunkRows(slim);
    const total = emptySummary();
    setRunning(true);
    setResult(null);
    setRunError(null);
    let offset = 0;
    try {
      for (let c = 0; c < chunks.length; c++) {
        setProgress({ done: offset, total: slim.length });
        const res = await importChunk({
          kind,
          rows: chunks[c],
          offset,
          final: c === chunks.length - 1,
          sessionId: kind === "students" ? sessionId || null : null,
          generate: kind === "students" ? generate : false,
        });
        const s = res.data as ImportSummary | undefined;
        if (s) {
          total.created += s.created;
          total.updated += s.updated;
          total.enrolled += s.enrolled;
          total.inserted += s.inserted;
          total.duplicates += s.duplicates;
          total.sent += s.sent;
          total.errors.push(...s.errors);
          if (s.generated) total.generated = true;
        }
        if (res.error) {
          setRunError(
            `Stopped at lines ${offset + 2}–${offset + chunks[c].length + 1}: ${res.error}` +
              (offset > 0 ? " Earlier lines were imported." : " Nothing was imported."),
          );
          break;
        }
        offset += chunks[c].length;
      }
    } catch (e) {
      setRunError(`The import was interrupted: ${e instanceof Error ? e.message : String(e)}.${offset > 0 ? ` Lines up to ${offset + 1} were imported.` : ""}`);
    }
    setProgress(null);
    setResult(total);
    setRunning(false);
  }

  const previewRows = parsed ? parsed.rows.slice(0, 10) : [];
  const canRun = !!parsed && missing.length === 0 && !running;

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="order-2 lg:order-1" title={spec.title} description={spec.intro}>
        {!result && (
          <div className="space-y-4">
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                parsed ? "border-line bg-surface-2" : "border-line-strong hover:border-accent hover:bg-accent-soft/40",
              )}
            >
              <FileSpreadsheet className="size-7 text-muted" aria-hidden />
              <span className="text-subhead font-medium text-ink">{parsed ? parsed.fileName : "Choose a CSV file"}</span>
              <span className="text-footnote text-ink-2">
                {parsed ? "Click to choose a different file" : "Save your spreadsheet as CSV (UTF-8). First row = column names."}
              </span>
              <input
                key={inputKey}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                disabled={running}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            <FormError message={fileError} />

            {parsed && (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-footnote text-ink-2">
                  <span>
                    <b className="text-ink">{parsed.rows.length.toLocaleString("en-IN")}</b> rows
                  </span>
                  <span className="flex flex-wrap items-center gap-1">
                    Columns:
                    {present.map((k) => (
                      <Badge key={k} tone="good">
                        {k}
                      </Badge>
                    ))}
                    {ignored.map((k) => (
                      <Badge key={k} title="Not a known column; ignored">
                        <span className="line-through opacity-70">{k}</span>
                      </Badge>
                    ))}
                  </span>
                </div>
                {missing.length > 0 && (
                  <FormError message={`The file needs ${missing.length === 1 ? "the column" : "the columns"} ${missing.join(", ")}. Check the first row of the file against the template.`} />
                )}
                {warnings.length > 0 && (
                  <ul className="space-y-1.5 rounded-2xl bg-warning-soft px-3 py-2.5 text-footnote text-ink">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div>
                  <p className="mb-1.5 text-footnote text-muted">
                    Preview of the first {Math.min(10, parsed.rows.length)} of {parsed.rows.length.toLocaleString("en-IN")} rows
                  </p>
                  <div className="max-h-[360px] overflow-auto rounded-2xl border border-line">
                    <table className="w-full border-collapse text-left text-footnote">
                      <thead className="sticky top-0 bg-surface-2 text-caption uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-2 py-1.5 text-right font-medium">Line</th>
                          {present.map((k) => (
                            <th key={k} className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {previewRows.map((r, i) => (
                          <tr key={i} className="border-t border-line">
                            <td className="px-2 py-1 text-right text-muted">{i + 2}</td>
                            {present.map((k) => {
                              const req = spec.columns.find((c) => c.key === k)?.required;
                              const v = r[k] ?? "";
                              return (
                                <td key={k} className={cn("max-w-[220px] truncate whitespace-nowrap px-2 py-1", req && !v.trim() && "bg-critical-soft")} title={v}>
                                  {v || <span className="text-muted">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {kind === "students" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Enrol in session" htmlFor="imp-session" hint="Rows with a class are enrolled (or moved) in this session.">
                      <Select id="imp-session" value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={running}>
                        {sessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value="">Do not enrol (student details only)</option>
                      </Select>
                    </Field>
                    <label className="flex items-start gap-2 self-center text-footnote text-ink sm:pt-5">
                      <input
                        type="checkbox"
                        checked={generate && !!sessionId}
                        disabled={!sessionId || running}
                        onChange={(e) => setGenerate(e.target.checked)}
                        className="mt-0.5 size-4 accent-[var(--accent)]"
                      />
                      <span>
                        Assign fees from the fee structure
                        <span className="block text-caption text-muted">Assigns any fees not assigned yet to everyone enrolled in the session.</span>
                      </span>
                    </label>
                  </div>
                )}

                <FormError message={runError} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="primary" disabled={!canRun} onClick={run}>
                    <Upload className="size-4" aria-hidden />
                    {running ? "Importing…" : `Import ${plural(parsed.rows.length, "row")}`}
                  </Button>
                  <Button type="button" variant="ghost" disabled={running} onClick={reset}>
                    Clear
                  </Button>
                  {progress && (
                    <span className="text-footnote text-ink-2" role="status">
                      Importing rows {(progress.done + 1).toLocaleString("en-IN")}–
                      {Math.min(progress.total, progress.done + MAX_ROWS).toLocaleString("en-IN")} of {progress.total.toLocaleString("en-IN")}…
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {result && <ResultView kind={kind} result={result} runError={runError} onAgain={reset} onDownloadErrors={downloadErrors} />}
      </Card>

      <Card
        className="order-1 lg:order-2"
        title="File format"
        description="CSV with these column names in the first row. Column order does not matter; extra columns are ignored."
        actions={
          <Button type="button" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" aria-hidden /> Template
          </Button>
        }
      >
        <ul className="divide-y divide-line text-footnote">
          {spec.columns.map((c) => (
            <li key={c.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="font-mono text-footnote text-ink">
                {c.key}
                {c.required && <span className="ml-1 font-sans text-caption font-medium text-critical-ink">required</span>}
              </span>
              {c.hint && <span className="text-right text-caption text-muted">{c.hint}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-line pt-3 text-footnote text-ink-2">
          Dates: <b>YYYY-MM-DD</b> or <b>DD-MM-YYYY</b> (DD/MM/YYYY also works; the day comes first). Amounts in rupees; commas and ₹ are
          fine. Large files are sent in batches of up to 1,000 rows.
        </p>
      </Card>
    </div>
  );
}

function ResultView({
  kind,
  result,
  runError,
  onAgain,
  onDownloadErrors,
}: {
  kind: ImportKind;
  result: ImportSummary;
  runError: string | null;
  onAgain: () => void;
  onDownloadErrors: () => void;
}) {
  const tiles: { label: string; value: number; tone?: "critical" }[] =
    kind === "students"
      ? [
          { label: "New students", value: result.created },
          { label: "Updated", value: result.updated },
          { label: "Enrolled", value: result.enrolled },
        ]
      : kind === "dues"
        ? [{ label: "Previous years' dues rows added", value: result.inserted }]
        : [
            { label: "Payments imported", value: result.inserted },
            { label: "Duplicates skipped", value: result.duplicates },
          ];
  tiles.push({ label: "Errors", value: result.errors.length, tone: result.errors.length ? "critical" : undefined });
  const shown = result.errors.slice(0, 200);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-subhead font-medium text-ink">
        {result.errors.length === 0 && !runError ? (
          <CheckCircle2 className="size-5 text-good" aria-hidden />
        ) : (
          <AlertTriangle className="size-5 text-warning" aria-hidden />
        )}
        {runError ? "Import stopped" : result.errors.length ? "Import finished with some errors" : "Import finished"}
      </div>
      <FormError message={runError} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl bg-fill-2 px-3 py-2">
            <div className="text-footnote text-ink-2">{t.label}</div>
            <div className={cn("text-xl font-semibold tabular", t.tone === "critical" ? "text-critical-ink" : "text-ink")}>
              {t.value.toLocaleString("en-IN")}
            </div>
          </div>
        ))}
      </div>
      {kind === "students" && result.generated && (
        <p className="text-footnote text-ink-2">Fees from the fee structure were assigned to the students enrolled in the session.</p>
      )}
      {result.errors.length > 0 && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-footnote text-muted">
              Line numbers match your file (line 1 is the column names). Fix these rows and import just them again.
            </p>
            <Button type="button" size="sm" onClick={onDownloadErrors}>
              <Download className="size-4" aria-hidden /> Error list
            </Button>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-2xl border border-line">
            <table className="w-full border-collapse text-left text-footnote">
              <thead className="sticky top-0 bg-surface-2 text-caption uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-1.5 text-right font-medium">Line</th>
                  <th className="px-3 py-1.5 font-medium">Admission no</th>
                  <th className="px-3 py-1.5 font-medium">Problem</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((e, i) => (
                  <tr key={i} className="border-t border-line align-top">
                    <td className="px-3 py-1.5 text-right tabular text-ink-2">{e.line || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-ink">{e.admission_no || "—"}</td>
                    <td className="px-3 py-1.5 text-ink-2">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.errors.length > shown.length && (
            <p className="mt-1 text-caption text-muted">Showing the first {shown.length}; download the list for all {result.errors.length}.</p>
          )}
        </div>
      )}
      <Button type="button" onClick={onAgain}>
        <RotateCcw className="size-4" aria-hidden /> Import another file
      </Button>
    </div>
  );
}
