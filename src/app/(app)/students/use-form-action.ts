"use client";

import { startTransition, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action-state";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * useActionState for a form, submitted from onSubmit so React does not reset the
 * fields afterwards (a failed save keeps what the user typed). Opens `state.redirect` after success.
 */
export function useFormAction(fn: FormAction, initial: ActionState = {}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(fn, initial);
  const router = useRouter();
  useEffect(() => {
    if (state.redirect) router.push(state.redirect);
  }, [state, router]);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }
  return [state, onSubmit, pending] as const;
}
