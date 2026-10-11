"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";

type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * useActionState for setup forms, submitted via onSubmit so React does not reset the form
 * (a failed save keeps what the user typed). The clicked button's name/value is included, and a
 * `data-confirm` attribute on that button asks for confirmation first.
 */
export function useFormAction(action: FormAction, opts: { resetOnSuccess?: boolean } = {}) {
  const [state, dispatch, pending] = useActionState<ActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const resetOnSuccess = !!opts.resetOnSuccess;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const question = submitter?.dataset.confirm;
    if (question && !window.confirm(question)) return;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  }

  useEffect(() => {
    if (resetOnSuccess && state.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  return { state, pending, onSubmit, formRef };
}
