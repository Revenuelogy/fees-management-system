"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useFormAction } from "../_lib/use-form-action";
import { listJoin, plural } from "@/lib/text";
import { promoteStudents } from "./actions";

export type PromoteRow = {
  class_id: string;
  class_name: string;
  active: number;
  inactive: number;
  already: number;
  defaultTarget: string; // class id | "passed" | "skip"
};

export function SessionPicker({ sessions, fromId, toId }: { sessions: { id: string; name: string }[]; fromId: string; toId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (from: string, to: string) => start(() => router.push(`/setup/promote?from=${from}&to=${to}`, { scroll: false }));
  return (
    <div className="grid items-end gap-3 sm:grid-cols-[14rem_auto_14rem] sm:justify-start">
      <Field label="From session" htmlFor="pr-from">
        <Select id="pr-from" value={fromId} disabled={pending} onChange={(e) => go(e.target.value, toId)}>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <ArrowRight className="mb-2.5 hidden size-4 text-muted sm:block" aria-hidden />
      <Field label="To session" htmlFor="pr-to">
        <Select id="pr-to" value={toId} disabled={pending} onChange={(e) => go(fromId, e.target.value)}>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function PromoteForm({
  fromId,
  toId,
  fromName,
  toName,
  rows,
  targets,
}: {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  rows: PromoteRow[];
  targets: { id: string; name: string; hasStructure: boolean }[];
}) {
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.class_id, r.defaultTarget])));
  const [generate, setGenerate] = useState(true);
  const { state, pending, onSubmit } = useFormAction(promoteStudents);

  const targetName = new Map(targets.map((t) => [t.id, t.name]));
  const pendingOf = (r: PromoteRow) => Math.max(0, r.active - r.already);
  let toPromote = 0;
  let toPass = 0;
  const passedClasses: string[] = [];
  const noStructure = new Set<string>();
  for (const r of rows) {
    const t = choice[r.class_id];
    if (t === "passed") {
      toPass += pendingOf(r);
      if (pendingOf(r)) passedClasses.push(r.class_name);
    } else if (t && t !== "skip") {
      toPromote += pendingOf(r);
      if (!targets.find((x) => x.id === t)?.hasStructure) noStructure.add(targetName.get(t) ?? "");
    }
  }
  const mapping = rows.map((r) => ({ from_class: r.class_id, target: choice[r.class_id] ?? "skip" }));
  const confirmText =
    `Promote ${plural(toPromote, "student")} from ${fromName} to ${toName}?` +
    (toPass ? ` ${plural(toPass, "student")} in ${listJoin(passedClasses)} will be marked as passed out.` : "");

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="from" value={fromId} />
      <input type="hidden" name="to" value={toId} />
      <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full border-collapse text-left text-subhead">
          <thead className="bg-surface-2 text-caption uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                Class in {fromName}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Students
              </th>
              <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                Already in {toName}
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Move to ({toName})
              </th>
            </tr>
          </thead>
          <tbody className="tabular">
            {rows.map((r) => {
              const t = choice[r.class_id];
              return (
                <tr key={r.class_id} className="border-t border-line align-middle">
                  <td className="px-3 py-2 font-medium text-ink">{r.class_name}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-medium text-ink">{r.active}</span>
                    {r.inactive > 0 && (
                      <span className="block text-caption text-muted" title="Students who left or passed out are not promoted">
                        +{r.inactive} inactive
                      </span>
                    )}
                    {r.already > 0 && <span className="block text-caption text-muted sm:hidden">{r.already} already moved</span>}
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {r.already > 0 ? <span className="text-ink">{r.already}</span> : <span className="text-muted">0</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={t}
                      aria-label={`Move ${r.class_name} to`}
                      onChange={(e) => setChoice((c) => ({ ...c, [r.class_id]: e.target.value }))}
                      className={t === "skip" ? "min-w-[10rem] text-muted" : "min-w-[10rem]"}
                    >
                      {targets.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                      <option value="passed">Passed out (leaves school)</option>
                      <option value="skip">Do not promote</option>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl bg-fill-2 px-3 py-2.5 text-footnote text-ink-2">
        Will enrol <b className="text-ink">{plural(toPromote, "student")}</b> in {toName}
        {toPass > 0 && (
          <>
            {" "}
            and mark <b className="text-ink">{plural(toPass, "student")}</b> as passed out
          </>
        )}
        . Students already enrolled in {toName} are left as they are; sections carry over.
        {noStructure.size > 0 && generate && (
          <p className="mt-1.5">
            <Badge tone="warning">No fee structure</Badge> {listJoin([...noStructure])} {noStructure.size === 1 ? "has" : "have"} no amounts in{" "}
            {toName} yet, so {noStructure.size === 1 ? "its" : "their"} students get no fees assigned until you set the structure and apply it.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 text-footnote text-ink">
        <input
          type="checkbox"
          name="generate"
          checked={generate}
          onChange={(e) => setGenerate(e.target.checked)}
          className="mt-0.5 size-4 accent-[var(--accent)]"
        />
        <span>
          Assign fees in {toName} from its fee structure
          <span className="block text-caption text-muted">You can also do this later from the fee structure page.</span>
        </span>
      </label>

      <FormError message={state.error} />
      <FormSuccess message={state.ok ? state.message : null} />
      <Button type="submit" variant="primary" disabled={pending || (toPromote === 0 && toPass === 0)} data-confirm={confirmText}>
        {pending ? "Promoting…" : `Promote ${plural(toPromote, "student")}`}
      </Button>
    </form>
  );
}
