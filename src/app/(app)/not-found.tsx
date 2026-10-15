import { SearchX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
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
