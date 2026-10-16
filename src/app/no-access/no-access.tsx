"use client";

import { ShieldCheck } from "lucide-react";
import { signOut } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import type { Viewer } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function NoAccess() {
  const { data: viewer } = useApi<Viewer>("/api/auth/me");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-[28px] bg-surface p-8 text-center shadow-card">
        <ShieldCheck className="mx-auto mb-3 size-8 text-muted" aria-hidden />
        <h1 className="text-lg font-semibold text-ink">Your account is waiting for access</h1>
        <p className="mt-2 text-sm text-ink-2">
          {viewer?.email ? <>You are signed in as <b>{viewer.email}</b>. </> : null}
          An administrator needs to give your account a role in Settings → Staff before you can see fee data.
        </p>
        <Button className="mt-5" onClick={signOut}>
          Sign out
        </Button>
      </div>
    </main>
  );
}
