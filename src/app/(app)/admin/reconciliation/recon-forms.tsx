"use client";

import { startTransition, useActionState } from "react";
import { Lock, LockOpen, RefreshCw } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Button } from "@/components/ui/button";
import { FormError, FormSuccess } from "@/components/ui/form";
import { closeMonth, reopenMonth, rerunAllocation } from "./actions";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function useAction(fn: ServerAction) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(fn, {});
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
  return [state, submit, pending] as const;
}

export function RerunAllocationForm() {
  const [state, submit, pending] = useAction(rerunAllocation);
  return (
    <form onSubmit={submit} className="space-y-3">
      <Button type="submit" variant="secondary" disabled={pending}>
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} aria-hidden />
        {pending ? "Re-running…" : "Re-run allocation for all payments"}
      </Button>
      <FormError message={state.error} />
      <FormSuccess message={state.message} />
    </form>
  );
}

export function MonthCloseForm({ month, closed }: { month: string; closed: boolean }) {
  const [state, submit, pending] = useAction(closed ? reopenMonth : closeMonth);
  return (
    <form onSubmit={submit} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="month" value={month} />
      <Button type="submit" size="sm" variant={closed ? "ghost" : "secondary"} disabled={pending}>
        {closed ? <LockOpen className="size-4" aria-hidden /> : <Lock className="size-4" aria-hidden />}
        {pending ? (closed ? "Reopening…" : "Closing…") : closed ? "Reopen" : "Close month"}
      </Button>
      {state.error && <span className="max-w-[260px] text-right text-caption text-critical-ink">{state.error}</span>}
    </form>
  );
}
