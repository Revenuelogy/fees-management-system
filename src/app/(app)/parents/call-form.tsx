"use client";

import { useState } from "react";
import { Ban, PhoneCall, PhoneMissed, PhoneOff, PhoneOutgoing } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/dates";
import { OUTCOMES, OUTCOME_LABELS, PICKED_BY, PICKED_BY_LABELS, RESPONSES, RESPONSE_LABELS, type CallOutcome } from "@/lib/recovery";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input, Select, Textarea } from "@/components/ui/form";
import { useFormAction } from "../setup/_lib/use-form-action";
import { logCall } from "./actions";

const OUTCOME_ICON: Record<CallOutcome, React.ElementType> = {
  connected: PhoneCall,
  no_answer: PhoneMissed,
  busy: PhoneOutgoing,
  switched_off: PhoneOff,
  wrong_number: Ban,
};

const SHORT: Record<CallOutcome, string> = {
  connected: "Picked up",
  no_answer: "No answer",
  busy: "Busy",
  switched_off: "Not reachable",
  wrong_number: "Wrong number",
};

/**
 * Log one call: did it get through, who picked up, what they said, the date (and amount) they promised, and when
 * to call again. With `nextHref`, "Save & next" opens the next family on the call list.
 */
export function CallForm({
  parentId,
  today,
  graceDays,
  campaignId,
  campaigns = [],
  nextHref,
}: {
  parentId: string;
  today: string;
  graceDays: number;
  /** log the call in this campaign (no campaign picker) */
  campaignId?: string;
  /** otherwise: active call campaigns to choose from */
  campaigns?: { id: string; name: string }[];
  nextHref?: string | null;
}) {
  const { state, pending, onSubmit, formRef } = useFormAction(logCall, { resetOnSuccess: true });
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [backDate, setBackDate] = useState(false);
  // after a saved call the form starts again (the inputs are reset by useFormAction)
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.ok) {
      setOutcome("connected");
      setBackDate(false);
    }
  }
  const connected = outcome === "connected";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="@container space-y-4">
      <input type="hidden" name="parent_id" value={parentId} />
      <input type="hidden" name="outcome" value={outcome} />
      {campaignId && <input type="hidden" name="campaign_id" value={campaignId} />}
      {nextHref && <input type="hidden" name="next_href" value={nextHref} />}

      <div>
        <p className="mb-2 text-footnote font-medium text-ink-2">Did they pick up?</p>
        <div className="grid grid-cols-3 gap-2 @md:grid-cols-5" role="radiogroup" aria-label="Call outcome">
          {OUTCOMES.map((o) => {
            const Icon = OUTCOME_ICON[o];
            const active = o === outcome;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={active}
                title={OUTCOME_LABELS[o]}
                onClick={() => setOutcome(o)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 text-caption font-semibold transition-all",
                  active
                    ? o === "connected"
                      ? "bg-accent text-accent-ink shadow-[0_2px_8px_rgba(0,113,227,0.3)]"
                      : "bg-ink text-surface"
                    : "bg-fill-2 text-ink-2 hover:bg-fill",
                )}
              >
                <Icon className="size-5" strokeWidth={2} />
                {SHORT[o]}
              </button>
            );
          })}
        </div>
      </div>

      {connected && (
        <div className="grid gap-3 @md:grid-cols-2">
          <Field label="Who picked up" htmlFor="picked_by">
            <Select id="picked_by" name="picked_by" defaultValue="father">
              {PICKED_BY.map((p) => (
                <option key={p} value={p}>
                  {PICKED_BY_LABELS[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What they said" htmlFor="response">
            <Select id="response" name="response" defaultValue="will_pay">
              {RESPONSES.map((r) => (
                <option key={r} value={r}>
                  {RESPONSE_LABELS[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Will pay by (tentative date)"
            htmlFor="promised_date"
            hint={graceDays > 0 ? `Paid within ${graceDays} ${graceDays === 1 ? "day" : "days"} after it still counts as kept.` : "Must be paid by this date to count as kept."}
          >
            <Input id="promised_date" name="promised_date" type="date" min={today} max={addDays(today, 180)} />
          </Field>
          <Field label="Amount promised (optional)" htmlFor="promised_amount" hint="Leave empty if they did not say.">
            <Input id="promised_amount" name="promised_amount" inputMode="decimal" placeholder="₹" />
          </Field>
        </div>
      )}

      <Field label={connected ? "What did they say, in brief?" : "Note (optional)"} htmlFor="summary">
        <Textarea
          id="summary"
          name="summary"
          rows={connected ? 3 : 2}
          placeholder={connected ? "Concern, reason for delay, mood of the call…" : "e.g. Tried twice, will try in the evening"}
        />
      </Field>

      <div className="grid gap-3 @md:grid-cols-2">
        <Field label="Call again on (optional)" htmlFor="follow_up_on" hint="When they asked to be called back.">
          <Input id="follow_up_on" name="follow_up_on" type="date" min={addDays(today, 1)} />
        </Field>
        {!campaignId && campaigns.length > 0 && (
          <Field label="Campaign" htmlFor="campaign_id">
            <Select id="campaign_id" name="campaign_id" defaultValue={campaigns[0]?.id ?? ""}>
              <option value="">No campaign</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {backDate ? (
          <Field label="Date of the call" htmlFor="call_date">
            <Input id="call_date" name="call_date" type="date" max={today} min={addDays(today, -60)} defaultValue={today} />
          </Field>
        ) : (
          <button type="button" onClick={() => setBackDate(true)} className="justify-self-start self-end pb-2 text-footnote font-medium text-accent">
            Logging an earlier call?
          </button>
        )}
      </div>

      <FormError message={state.error} />
      <FormSuccess message={state.ok && !state.redirect ? state.message : null} />
      <div className="flex flex-wrap gap-2">
        {nextHref && (
          <Button type="submit" name="go" value="next" variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Save & next family"}
          </Button>
        )}
        <Button type="submit" variant={nextHref ? "secondary" : "primary"} disabled={pending}>
          {pending && !nextHref ? "Saving…" : "Save call"}
        </Button>
      </div>
    </form>
  );
}
