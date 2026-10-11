"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { useFormAction } from "../_lib/use-form-action";
import { addDays, addMonthsIso, isIsoDate, isoFrom, shiftYears } from "../_lib/dates";
import { createSession } from "./actions";

type Row = { name: string; due_date: string };
type ExistingSession = { id: string; name: string; start_date: string; end_date: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function defaultsFor(year: number, startMonth: number) {
  const name = startMonth === 1 ? String(year) : `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  const start = isoFrom(year, startMonth, 1);
  const end = addDays(isoFrom(year + 1, startMonth, 1), -1);
  // three installments, four months apart, due on the 10th (April start: 10 Apr, 10 Aug, 10 Dec)
  const rows: Row[] = [0, 4, 8].map((offset, i) => ({ name: `Installment ${i + 1}`, due_date: isoFrom(year, startMonth + offset, 10) }));
  return { name, start, end, rows };
}

export function CreateSessionForm({
  sessions,
  startMonth,
  defaultYear,
}: {
  sessions: ExistingSession[];
  startMonth: number;
  defaultYear: number;
}) {
  const initial = defaultsFor(defaultYear, startMonth);
  const [year, setYear] = useState(defaultYear);
  const [name, setName] = useState(initial.name);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [copyFrom, setCopyFrom] = useState(sessions[0]?.id ?? "");
  const [current, setCurrent] = useState(sessions.length === 0);

  function applyYear(y: number, shiftFrom: number | null) {
    const d = defaultsFor(y, startMonth);
    setYear(y);
    setName(d.name);
    setStart(d.start);
    setEnd(d.end);
    setRows((prev) =>
      shiftFrom === null ? d.rows : prev.map((r) => ({ ...r, due_date: isIsoDate(r.due_date) ? shiftYears(r.due_date, y - shiftFrom) : r.due_date })),
    );
  }

  async function submit(prev: ActionState, fd: FormData): Promise<ActionState> {
    const res = await createSession(prev, fd);
    if (res.ok) {
      // ready for the following year
      const created = Number(String(fd.get("start_date") ?? "").slice(0, 4));
      if (created) applyYear(created + 1, null);
      setCurrent(false);
    }
    return res;
  }

  const { state, pending, onSubmit } = useFormAction(submit);

  const existingYears = new Set(sessions.map((s) => Number(s.start_date.slice(0, 4))));
  const years: number[] = [];
  for (let y = defaultYear - 5; y <= defaultYear + 3; y++) years.push(y);
  if (!years.includes(year)) years.push(year);

  const nameTaken = sessions.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
  const overlap = isIsoDate(start) && isIsoDate(end) ? sessions.find((s) => s.start_date <= end && s.end_date >= start) : undefined;
  const outside = rows.filter((r) => isIsoDate(r.due_date) && isIsoDate(start) && isIsoDate(end) && (r.due_date < start || r.due_date > end));

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="installments" value={JSON.stringify(rows)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Session starts in" htmlFor="ns-year" hint={`Sessions start in ${MONTHS[startMonth - 1]} (school settings).`}>
          <Select id="ns-year" value={year} onChange={(e) => applyYear(Number(e.target.value), year)}>
            {years.map((y) => (
              <option key={y} value={y}>
                {MONTHS[startMonth - 1].slice(0, 3)} {y}
                {existingYears.has(y) ? " (exists)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Session name" htmlFor="ns-name">
          <Input id="ns-name" name="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Start date" htmlFor="ns-start">
          <Input id="ns-start" name="start_date" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="End date" htmlFor="ns-end">
          <Input id="ns-end" name="end_date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
      </div>
      {nameTaken && <p className="text-[12.5px] text-critical-ink">A session named {name.trim()} already exists.</p>}
      {overlap && !nameTaken && (
        <p className="text-[12.5px] text-critical-ink">
          These dates overlap session {overlap.name}. Sessions cannot overlap.
        </p>
      )}

      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink-2">Installments</legend>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[1.75rem_minmax(0,1fr)_10rem_auto]">
              <span className="text-[13px] font-semibold tabular text-ink-2">#{i + 1}</span>
              <Input
                value={r.name}
                aria-label={`Installment ${i + 1} name`}
                onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <Input
                type="date"
                value={r.due_date}
                required
                aria-label={`Installment ${i + 1} due date`}
                className="col-start-2 row-start-2 sm:col-start-auto sm:row-start-auto"
                onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="col-start-3 row-start-1 px-2 sm:col-start-auto sm:row-start-auto"
                disabled={rows.length <= 1}
                aria-label={`Remove installment ${i + 1}`}
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          onClick={() =>
            setRows((prev) => {
              const last = prev[prev.length - 1]?.due_date;
              const due = last && isIsoDate(last) ? addMonthsIso(last, 1) : start;
              return [...prev, { name: `Installment ${prev.length + 1}`, due_date: due }];
            })
          }
        >
          <Plus className="size-4" aria-hidden /> Add installment
        </Button>
        {outside.length > 0 && (
          <p className="mt-2 text-[12.5px] text-ink-2">Note: {outside.length === 1 ? "one due date falls" : `${outside.length} due dates fall`} outside the session dates.</p>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Copy fee structure from"
          htmlFor="ns-copy"
          hint="Amounts are copied by installment number. You can change them afterwards."
        >
          <Select id="ns-copy" name="copy_from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Do not copy (start empty)</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-start gap-2 self-center text-[13px] text-ink sm:pt-5">
          <input
            type="checkbox"
            name="make_current"
            checked={current}
            onChange={(e) => setCurrent(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--accent)]"
          />
          <span>
            Make this the current session
            <span className="block text-[12px] text-muted">Usually done when the new year begins.</span>
          </span>
        </label>
      </div>

      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : null} />
      <Button type="submit" variant="primary" disabled={pending || nameTaken || !!overlap}>
        {pending ? "Creating…" : `Create session ${name.trim()}`}
      </Button>
    </form>
  );
}
