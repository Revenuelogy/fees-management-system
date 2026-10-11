"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { createTarget, deleteTarget } from "./actions";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { Field, FormError, FormSuccess, Input } from "@/components/ui/form";

export function TargetForm({ sessionId, defaultDate }: { sessionId: string; defaultDate: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createTarget, {});
  return (
    <form action={action} className="grid items-end gap-3 sm:grid-cols-[1fr_120px_170px_auto]">
      <input type="hidden" name="session_id" value={sessionId} />
      <Field label="Target name (optional)" htmlFor="t-name">
        <Input id="t-name" name="name" placeholder="e.g. 90% of fees due by 31 December" />
      </Field>
      <Field label="Collect %" htmlFor="t-pct">
        <Input id="t-pct" name="target_pct" type="number" min={1} max={100} step="0.5" defaultValue={90} required />
      </Field>
      <Field label="Of fees due by" htmlFor="t-date">
        <Input id="t-date" name="target_date" type="date" defaultValue={defaultDate} required />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Adding…" : "Add target"}
      </Button>
      <div className="sm:col-span-4">
        <FormError message={state.error} />
        <FormSuccess message={state.message} />
      </div>
    </form>
  );
}

export function DeleteTargetButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this target?")) start(async () => void (await deleteTarget(id)));
      }}
      className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-critical-ink"
      aria-label="Delete target"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
