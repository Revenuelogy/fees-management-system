"use client";

import { ErrorCard } from "@/components/ui/page-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorCard message={error.message} detail={error.digest ? `Reference: ${error.digest}` : undefined} onRetry={reset} />;
}
