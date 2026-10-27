"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState, useTransition } from "react";
import { CheckCircle2, Search, UserPlus, X } from "lucide-react";
import { apiUrl } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { addDays, isIsoDate } from "@/lib/dates";
import { fmtDate, rupeesShort } from "@/lib/format";
import { fmtPhone } from "@/lib/recovery";
import { ROLE_LABELS } from "@/lib/roles";
import { plural } from "@/lib/text";
import type { ActionState } from "@/lib/action-state";
import type { CallAssignments, FamilySearchRow } from "@/lib/types";
import { Pending } from "@/components/ui/page-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select } from "@/components/ui/form";
import { Empty } from "@/components/ui/empty";
import { withParams } from "@/components/ui/segmented";
import { assignFamily, unassignFamily } from "./actions";

/**
 * Give any family (on the day's list or not) to a caller for today or a later day, with a note for them, and see who
 * has which families that day. The family shows first on the caller's list that day, marked "Given by …".
 */
export function AssignPanel({ date: dateParam, callerId }: { date?: string; callerId?: string }) {
  const res = useApi<CallAssignments>(apiUrl("/api/calls/assignments", { date: isIsoDate(dateParam) ? dateParam : undefined }));
  if (!res.data) return <Pending queries={[res]} />;
  return <Assignments d={res.data} callerId={callerId} />;
}

function Assignments({ d, callerId }: { d: CallAssignments; callerId?: string }) {
  const router = useRouter();
  const go = (date: string) => router.push(withParams("/calls", { view: "assign", date: date === d.today ? undefined : date, caller: callerId }), { scroll: false });
  const byCaller = d.callers.map((c) => ({ ...c, rows: d.rows.filter((r) => r.assigned_to === c.user_id) }));
  // families given to someone who no longer makes calls stay visible
  const others = d.rows.filter((r) => !d.callers.some((c) => c.user_id === r.assigned_to));

  return (
    <div className="space-y-5">
      <AssignForm d={d} callerId={callerId} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-title3 font-semibold text-ink">
          Lists for {d.date === d.today ? "today" : d.date === addDays(d.today, 1) ? "tomorrow" : fmtDate(d.date)}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <DayChip label="Today" active={d.date === d.today} onClick={() => go(d.today)} />
          <DayChip label="Tomorrow" active={d.date === addDays(d.today, 1)} onClick={() => go(addDays(d.today, 1))} />
          <Input
            type="date"
            aria-label="Show the lists of another day"
            value={d.date}
            min={d.today}
            max={d.max_date}
            onChange={(e) => isIsoDate(e.target.value) && go(e.target.value)}
            className="h-9 w-auto"
          />
        </div>
      </div>

      {d.callers.length === 0 ? (
        <Card>
          <Empty title="Nobody makes calls yet" icon={UserPlus}>
            Give staff the Caller role in Settings → Staff.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {byCaller.map((c) => (
            <Card
              key={c.user_id}
              title={c.name}
              subtitle={`${ROLE_LABELS[c.role]} · ${c.families === 0 ? "nothing given" : `${plural(c.families, "family", "families")} · ${c.called} called`}`}
              className={cn(c.user_id === callerId && "ring-2 ring-accent")}
            >
              {c.rows.length === 0 ? (
                <p className="text-footnote text-muted">
                  {d.date === d.today ? "Nothing given today. They take families from the day's list themselves." : "Nothing given for this day yet."}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {c.rows.map((r) => (
                    <AssignedRow key={r.parent_id} r={r} date={d.date} />
                  ))}
                </ul>
              )}
            </Card>
          ))}
          {others.length > 0 && (
            <Card title="Others" subtitle="Given to staff who no longer make calls">
              <ul className="divide-y divide-line">
                {others.map((r) => (
                  <AssignedRow key={r.parent_id} r={r} date={d.date} />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function DayChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("h-9 rounded-full px-3.5 text-footnote font-medium", active ? "bg-ink text-surface" : "bg-fill text-ink hover:bg-fill-2")}
    >
      {label}
    </button>
  );
}

function AssignedRow({ r, date }: { r: CallAssignments["rows"][number]; date: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const self = r.assigned_by === r.assigned_to;
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/parents/${r.parent_id}`} className="text-subhead font-semibold text-ink hover:text-accent">
            {r.name}
          </Link>
          <p className="truncate text-caption text-muted">
            {fmtPhone(r.phone)}
            {r.children.length > 0 && ` · ${r.children.map((k) => `${k.full_name.split(" ")[0]}${k.class_name ? ` (${k.class_name})` : ""}`).join(", ")}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-right">
            <span className={cn("block text-footnote font-semibold tabular", r.to_recover > 0 ? "text-critical-ink" : "text-good-ink")}>{rupeesShort(r.to_recover)}</span>
            <span className="block text-caption text-muted">to recover</span>
          </span>
          {!r.called && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => setState(await unassignFamily(r.parent_id, date)))}
              className="inline-flex size-9 items-center justify-center rounded-full text-muted hover:bg-fill-2 hover:text-ink"
              aria-label={`Take ${r.name} off the list`}
              title="Take off the list"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-caption text-ink-2">
        {r.called ? (
          <span className="inline-flex items-center gap-1 font-medium text-good-ink">
            <CheckCircle2 className="size-3.5" aria-hidden /> Called
          </span>
        ) : (
          "To call"
        )}
        {" · "}
        {self ? "took it themselves" : `given by ${r.assigned_by_name ?? "staff"}`}
        {r.note && <span className="text-ink"> · “{r.note}”</span>}
      </p>
      <FormError message={state.error} />
    </li>
  );
}

/** Find a family, choose the caller and the day, add a note, give. */
function AssignForm({ d, callerId }: { d: CallAssignments; callerId?: string }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const [family, setFamily] = useState<FamilySearchRow | null>(null);
  const [caller, setCaller] = useState(callerId && d.callers.some((c) => c.user_id === callerId) ? callerId : (d.callers.find((c) => c.role === "caller")?.user_id ?? d.callers[0]?.user_id ?? ""));
  const [day, setDay] = useState(d.date);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const res = useApi<FamilySearchRow[]>(!family && query.length >= 2 ? apiUrl("/api/families/search", { q: query }) : null, { refreshInterval: 0 });

  const give = () =>
    start(async () => {
      if (!family) return setState({ error: "Choose a family." });
      if (!caller) return setState({ error: "Choose who will call." });
      const r = await assignFamily(family.parent_id, caller, day === d.today ? null : day, note.trim() || null);
      setState(r);
      if (r.ok) {
        setFamily(null);
        setQ("");
        setNote("");
      }
    });

  return (
    <Card title="Give a family to a caller" description="Any family, on the day's list or not. It shows first on the caller's list that day, with your note.">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_170px]">
        <Field label="Family" htmlFor="assign-family">
          {family ? (
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-fill-2 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-subhead font-semibold text-ink">{family.name}</span>
                <span className="block truncate text-caption text-muted">
                  {fmtPhone(family.phone)} · {family.children.map((k) => k.full_name.split(" ")[0]).join(", ")}
                </span>
              </span>
              <button type="button" onClick={() => setFamily(null)} className="text-footnote font-medium text-accent">
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                id="assign-family"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Parent or child name, phone, admission no…"
                className="pl-9"
                autoComplete="off"
              />
              {query.length >= 2 && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2xl bg-surface p-1 shadow-pop">
                  {!res.data ? (
                    <p className="px-3 py-2 text-footnote text-muted">{res.error ? res.error.message : "Searching…"}</p>
                  ) : res.data.length === 0 ? (
                    <p className="px-3 py-2 text-footnote text-muted">No family found.</p>
                  ) : (
                    res.data.map((f) => (
                      <button
                        key={f.parent_id}
                        type="button"
                        onClick={() => setFamily(f)}
                        className="flex w-full min-h-11 flex-col items-start rounded-xl px-3 py-2 text-left hover:bg-fill-2"
                      >
                        <span className="text-subhead font-medium text-ink">{f.name}</span>
                        <span className="text-caption text-muted">
                          {fmtPhone(f.phone)} · {f.children.map((k) => `${k.full_name}${k.class_name ? ` (${k.class_name})` : ""}`).join(", ") || "No children linked"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Field>
        <Field label="Who will call" htmlFor="assign-caller">
          <Select id="assign-caller" value={caller} onChange={(e) => setCaller(e.target.value)}>
            {d.callers.map((c) => (
              <option key={c.user_id} value={c.user_id}>
                {c.name} ({ROLE_LABELS[c.role]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Day" htmlFor="assign-day">
          <Input id="assign-day" type="date" value={day} min={d.today} max={d.max_date} onChange={(e) => setDay(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Note for the caller (optional)" htmlFor="assign-note" className="flex-1">
          <Input id="assign-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ask about the transport fee; the father prefers evenings" />
        </Field>
        <Button type="button" variant="primary" disabled={pending || !family || !caller} onClick={give}>
          <UserPlus className="size-4" /> {pending ? "Giving…" : "Give"}
        </Button>
      </div>
      <div className="mt-2">
        <FormError message={state.error} />
        <FormSuccess message={state.ok ? state.message : null} />
      </div>
    </Card>
  );
}
