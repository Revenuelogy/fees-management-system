import { LogOut } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { getActiveSession, getSessions, getSettings } from "@/lib/context";
import { signOut } from "@/app/actions";
import { Sidebar } from "@/components/layout/sidebar";
import { SessionSwitcher } from "@/components/layout/session-switcher";
import { StudentSearch } from "@/components/layout/student-search";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const [sessions, active, settings] = await Promise.all([getSessions(), getActiveSession(), getSettings()]);
  const name = viewer.profile?.full_name || viewer.user.email || "Staff";

  return (
    <div className="min-h-screen">
      <Sidebar role={viewer.role} schoolName={settings?.school_name ?? "My School"} />
      <div className="lg:pl-60 print:pl-0">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 pl-14 pr-3 sm:pr-5 lg:pl-5">
            <StudentSearch className="min-w-0 max-w-md flex-1" canCollect={canWrite(viewer.role)} />
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <SessionSwitcher sessions={sessions} activeId={active?.id ?? null} />
              <div className="hidden text-right leading-tight md:block">
                <div className="text-[13px] font-medium text-ink">{name}</div>
                <div className="text-[11.5px] capitalize text-muted">{viewer.role}</div>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  title="Sign out"
                  aria-label="Sign out"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
