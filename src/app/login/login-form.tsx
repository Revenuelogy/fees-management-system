"use client";

import { useActionState } from "react";
import { api, errorMessage } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import { Field, FormError, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(async (_prev, formData) => {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    if (!email || !password) return { error: "Enter your email and password." };
    try {
      await api.post("/api/auth/login", { email, password });
    } catch (e) {
      return { error: errorMessage(e) };
    }
    // full load: the app shell starts fresh with the new session
    window.location.assign(next);
    return { ok: true };
  }, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormError message={state.error} />
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || state.ok}>
        {pending || state.ok ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
