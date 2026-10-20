"use client";

import { AlertTriangle, SearchX } from "lucide-react";
import type { ApiError } from "@/lib/api/client";
import { Button, LinkButton } from "@/components/ui/button";

export function PageSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-40 rounded bg-surface-3" />
      <div className="mb-6 h-7 w-72 rounded bg-surface-3" />
      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-32 rounded-[22px] bg-surface shadow-card" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-[22px] bg-surface shadow-card" />
        <div className="h-72 rounded-[22px] bg-surface shadow-card" />
      </div>
    </div>
  );
}

export function NotFoundCard() {
  return (
    <div className="mx-auto max-w-lg rounded-[28px] bg-surface p-8 text-center shadow-card">
      <SearchX className="mx-auto mb-3 size-8 text-muted" aria-hidden />
      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-ink-2">That student, payment or page does not exist (or was removed).</p>
      <LinkButton href="/" className="mt-4">
        Back to dashboard
      </LinkButton>
    </div>
  );
}

export function ErrorCard({ message, detail, onRetry }: { message?: string; detail?: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-[28px] bg-surface p-8 text-center shadow-card">
      <AlertTriangle className="mx-auto mb-3 size-8 text-critical" aria-hidden />
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-2">{message || "The page could not be loaded."}</p>
      {detail && <p className="mt-1 text-caption text-muted">{detail}</p>}
      <Button className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

type Query = { data?: unknown; error?: ApiError; mutate: () => unknown };

/** True once every query has data. */
export function ready(...queries: Query[]) {
  return queries.every((q) => q.data !== undefined);
}

/**
 * What to show until every query has data: the skeleton while loading, a not-found card for a 404, or the
 * API's error message with a retry button.
 */
export function Pending({ queries, skeleton }: { queries: Query[]; skeleton?: React.ReactNode }) {
  const failed = queries.find((q) => q.error && q.data === undefined);
  if (failed?.error) {
    if (failed.error.status === 404) return <NotFoundCard />;
    return <ErrorCard message={failed.error.message} onRetry={() => queries.forEach((q) => q.mutate())} />;
  }
  return <>{skeleton ?? <PageSkeleton />}</>;
}
