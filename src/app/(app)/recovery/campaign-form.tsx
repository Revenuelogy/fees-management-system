"use client";

import type { CampaignInfo, CampaignKind, SchoolClass } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { Button, LinkButton } from "@/components/ui/button";
import { toRupeeInput } from "../students/helpers";
import { useFormAction } from "../setup/_lib/use-form-action";
import { saveCampaign } from "./actions";

/** Settings of a call campaign (with the rules that build its call list) or of a student activity. */
export function CampaignForm({
  kind,
  campaign,
  classes,
  today,
  graceDays,
}: {
  kind: CampaignKind;
  campaign?: CampaignInfo;
  classes: SchoolClass[];
  today: string;
  graceDays: number;
}) {
  const { state, pending, onSubmit } = useFormAction(saveCampaign);
  const c = campaign;
  const calls = kind === "calls";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="kind" value={kind} />

      <Card title={calls ? "Campaign" : "Activity"}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Name *" htmlFor="name" className="sm:col-span-2">
            <Input
              id="name"
              name="name"
              required
              defaultValue={c?.name ?? ""}
              autoFocus={!c}
              placeholder={calls ? "e.g. October fee drive" : "e.g. English speaking club for Class 6–7"}
            />
          </Field>
          <Field label="Starts *" htmlFor="start_date">
            <Input id="start_date" name="start_date" type="date" required defaultValue={c?.start_date ?? today} />
          </Field>
          <Field label="Ends" htmlFor="end_date" hint="Optional.">
            <Input id="end_date" name="end_date" type="date" defaultValue={c?.end_date ?? ""} />
          </Field>
          <Field
            label={calls ? "Goal of the campaign" : "What we do, and what we ask of the parents"}
            htmlFor="description"
            className="sm:col-span-2 lg:col-span-4"
          >
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={c?.description ?? ""}
              placeholder={
                calls
                  ? "e.g. Call every family behind on fees before the half-yearly exams"
                  : "e.g. Extra spoken-English practice three days a week; parents asked to clear pending fees so the school can run it"
              }
            />
          </Field>
          <Field label="Target to recover (₹)" htmlFor="target_amount" hint="Optional. Shown as progress.">
            <Input id="target_amount" name="target_amount" inputMode="decimal" defaultValue={toRupeeInput(c?.target_amount)} />
          </Field>
          {c && (
            <Field label="Status" htmlFor="status" hint={calls ? "A closed campaign keeps its results; no new calls in it." : "A closed activity keeps its results."}>
              <Select id="status" name="status" defaultValue={c.status}>
                <option value="active">Running</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
          )}
        </div>
        {!calls && !c && <p className="mt-4 text-footnote text-ink-2">Next you add the students: a whole class, or one by one.</p>}
      </Card>

      {calls && (
        <Card
          title="Who goes on the call list"
          description={`Families are called when they owe at least the minimum (overdue, incl. old dues) and any ticked rule holds. A family that promised a date leaves the list until the date plus ${graceDays} grace ${graceDays === 1 ? "day" : "days"}; if nothing is paid by then they come back the next day.`}
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Owes at least (₹ overdue)" htmlFor="min_due">
                <Input id="min_due" name="min_due" inputMode="decimal" defaultValue={toRupeeInput(c?.min_due ?? 100)} required />
              </Field>
              <Field label="Days before calling again" htmlFor="recall_days" hint="After a call that got through, or a payment. Unanswered calls are tried the next day.">
                <Input id="recall_days" name="recall_days" type="number" min={1} max={90} defaultValue={c?.recall_days ?? 7} required />
              </Field>
            </div>

            <fieldset className="space-y-3">
              <legend className="mb-1 text-footnote font-medium text-ink-2">…and any of these is true</legend>
              <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="use_silent" defaultChecked={c ? c.silent_days !== null : true} className="size-4 accent-[var(--accent)]" />
                Nothing paid for
                <Input name="silent_days" type="number" min={1} max={730} defaultValue={c?.silent_days ?? 60} className="h-8 w-20" aria-label="Days without payment" />
                days (or never)
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="use_high" defaultChecked={c ? c.high_due !== null : true} className="size-4 accent-[var(--accent)]" />
                Overdue is ₹
                <Input name="high_due" inputMode="decimal" defaultValue={toRupeeInput(c?.high_due ?? 2000000)} className="h-8 w-28" aria-label="Big dues amount" />
                or more
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="include_old_dues" defaultChecked={c ? c.include_old_dues : true} className="size-4 accent-[var(--accent)]" />
                Owes fees of earlier sessions (old dues)
              </label>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="include_broken" defaultChecked={c ? c.include_broken : true} className="size-4 accent-[var(--accent)]" />
                Did not pay by the date they promised
              </label>
              <p className="text-caption text-muted">Untick everything to call every family that owes the minimum.</p>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-footnote font-medium text-ink-2">Only families with a child in (none ticked = all classes)</legend>
              <div className="flex flex-wrap gap-2">
                {classes
                  .filter((k) => k.is_active || c?.class_ids.includes(k.id))
                  .map((k) => (
                    <label key={k.id} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-fill-2 px-3 py-1.5 text-footnote font-medium text-ink has-[:checked]:bg-accent-soft has-[:checked]:text-accent">
                      <input type="checkbox" name="class_ids" value={k.id} defaultChecked={c?.class_ids.includes(k.id)} className="size-3.5 accent-[var(--accent)]" />
                      {k.name}
                    </label>
                  ))}
              </div>
            </fieldset>
          </div>
        </Card>
      )}

      <FormError message={state.error} />
      <FormSuccess message={state.ok && !state.redirect ? state.message : null} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : c ? "Save changes" : calls ? "Start campaign" : "Create activity"}
        </Button>
        <LinkButton href={c ? `/recovery/${c.id}` : "/recovery"} variant="ghost">
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}
