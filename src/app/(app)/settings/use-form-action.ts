"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/lib/action-state";

type ServerAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * useActionState for a form, submitted from onSubmit so React does not reset the
 * fields afterwards (a failed save keeps what the user typed).
 */
export function useFormAction(fn: ServerAction, initial: ActionState = {}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(fn, initial);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }
  return [state, onSubmit, pending] as const;
}
