"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SWRConfig, type SWRConfiguration } from "swr";
import { LogOut } from "lucide-react";
import { ApiError, signOut } from "@/lib/api/client";
import { useApi } from "@/lib/api/hooks";
import { SESSION_COOKIE } from "@/lib/context";
import { canWrite, isAdmin } from "@/lib/roles";
import type { AcademicSession, AppRole, SchoolClass, SchoolSettings, Viewer } from "@/lib/types";
import { Sidebar } from "@/components/layout/sidebar";
import { SessionSwitcher } from "@/components/layout/session-switcher";
import { StudentSearch } from "@/components/layout/student-search";
import { Avatar } from "@/components/ui/avatar";
import { ErrorCard } from "@/components/ui/page-state";

/** GET /api/bootstrap */
export type Bootstrap = { viewer: Viewer; sessions: AcademicSession[]; classes: SchoolClass[]; settings: SchoolSettings };

type AppContextValue = Bootstrap & {
  viewer: Viewer & { role: AppRole };
  /** The session picked in the top bar: the remembered choice, else the current one, else the latest. */
  session: AcademicSession | null;
  setSessionId: (id: string) => void;
  /** Admin or accountant */
  writer: boolean;
  admin: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp() is only available inside the signed-in app shell.");
  return ctx;
}

/**
 * Screens for admins and accountants (or admins only). Others are sent to the dashboard, as before; the
 * API refuses their requests either way.
 */
export function RequireRole({ role, children }: { role: "writer" | "admin"; children: React.ReactNode }) {
  const { writer, admin } = useApp();
  const router = useRouter();
  const allowed = role === "admin" ? admin : writer;
  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);
  return allowed ? <>{children}</> : null;
}

/**
 * Browser-side data cache. The API caches its database reads for CACHE_TTL_SECONDS (30 s by default)
 * and drops them on every write; on top of that the browser keeps what it fetched, shows it instantly
 * on revisits, and refreshes visible data when the tab regains focus and once a minute.
 */
const SWR_OPTIONS: SWRConfiguration = {
  dedupingInterval: 5_000,
  focusThrottleInterval: 15_000,
  refreshInterval: 60_000,
  errorRetryCount: 3,
  shouldRetryOnError: (e) => !(e instanceof ApiError) || e.status === 0 || e.status >= 500,
};

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={SWR_OPTIONS}>
      <Shell>{children}</Shell>
    </SWRConfig>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const boot = useApi<Bootstrap>("/api/bootstrap");
  const [chosenId, setChosenId] = useState<string | null>(() => readCookie(SESSION_COOKIE));

  if (!boot.data) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        {boot.error ? (
          <ErrorCard message={boot.error.message} onRetry={() => boot.mutate()} />
        ) : (
          <span className="size-9 animate-pulse rounded-[11px] bg-gradient-to-b from-[#2c8cff] to-[#0062c4]" aria-label="Loading" />
        )}
      </div>
    );
  }

  const { viewer, sessions, settings } = boot.data;
  const role = viewer.role as AppRole; // the API only answers staff here
  const session = sessions.find((s) => s.id === chosenId) ?? sessions.find((s) => s.is_current) ?? sessions[0] ?? null;
  const writer = canWrite(role);
  const value: AppContextValue = {
    ...boot.data,
    viewer: { ...viewer, role },
    session,
    setSessionId(id) {
      document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      setChosenId(id);
    },
    writer,
    admin: isAdmin(role),
  };
  const name = viewer.full_name || viewer.email || "Staff";

  return (
    <AppContext.Provider value={value}>
      <div className="min-h-screen">
        <Sidebar role={role} schoolName={settings.school_name} canCollect={writer} />
        <div className="lg:pl-[248px] print:pl-0">
          <header className="no-print sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-2xl backdrop-saturate-150">
            <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 pl-14 pr-3 sm:pr-6 lg:pl-8">
              <StudentSearch className="min-w-0 max-w-[420px] flex-1" canCollect={writer} />
              <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                <SessionSwitcher sessions={sessions} activeId={session?.id ?? null} onChange={value.setSessionId} />
                <div className="hidden items-center gap-2.5 md:flex">
                  <Avatar name={name} size="sm" />
                  <div className="leading-tight">
                    <div className="max-w-[140px] truncate text-footnote font-semibold text-ink">{name}</div>
                    <div className="text-caption capitalize text-muted">{role}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  title="Sign out"
                  aria-label="Sign out"
                  className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-fill hover:text-ink"
                >
                  <LogOut className="size-4" />
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 print:max-w-none print:p-0">{children}</main>
        </div>
      </div>
    </AppContext.Provider>
  );
}
