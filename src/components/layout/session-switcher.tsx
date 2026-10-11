"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setActiveSession } from "@/app/actions";
import type { AcademicSession } from "@/lib/types";

export function SessionSwitcher({ sessions, activeId }: { sessions: AcademicSession[]; activeId: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (sessions.length === 0) return null;
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-ink-2">
      <span className="hidden sm:inline">Session</span>
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
        className="h-8 w-[92px] rounded-lg border border-line-strong bg-surface px-2 pr-6 text-[13px] font-medium text-ink focus:border-accent focus:outline-none disabled:opacity-60 sm:w-auto sm:pr-7"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.is_current ? " (current)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
