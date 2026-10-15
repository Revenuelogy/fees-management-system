"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveSession } from "@/app/actions";
import type { AcademicSession } from "@/lib/types";

export function SessionSwitcher({ sessions, activeId }: { sessions: AcademicSession[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (sessions.length === 0) return null;
  const active = sessions.find((s) => s.id === activeId);
  const current = sessions.find((s) => s.is_current);
  const note = !active ? null : active.is_current ? "Current session" : current && active.start_date < current.start_date ? "Past session" : "Upcoming session";
  return (
    <label className="inline-flex items-center gap-2 text-footnote text-ink-2">
      {note && <span className={`hidden text-caption font-medium lg:inline ${active?.is_current ? "text-muted" : "text-accent"}`}>{note}</span>}
      <select
        value={activeId ?? ""}
        disabled={pending}
        aria-label="Academic session"
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await setActiveSession(id);
            router.refresh();
          });
        }}
        className="h-8 rounded-full bg-fill px-3 pr-7 text-footnote font-semibold text-ink transition-colors hover:bg-[rgba(118,118,128,0.18)] focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
