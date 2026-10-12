"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-[28px] bg-surface p-8 text-center shadow-card">
      <AlertTriangle className="mx-auto mb-3 size-8 text-critical" aria-hidden />
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-2">{error.message || "The page could not be loaded."}</p>
      {error.digest && <p className="mt-1 text-caption text-muted">Reference: {error.digest}</p>}
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
