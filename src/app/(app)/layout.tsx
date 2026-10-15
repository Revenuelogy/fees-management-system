import { LogOut } from "lucide-react";
import { requireStaff, canWrite } from "@/lib/auth";
import { getActiveSession, getSessions, getSettings } from "@/lib/context";
import { signOut } from "@/app/actions";
import { Sidebar } from "@/components/layout/sidebar";
import { SessionSwitcher } from "@/components/layout/session-switcher";
import { StudentSearch } from "@/components/layout/student-search";
import { Avatar } from "@/components/ui/avatar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireStaff();
  const [sessions, active, settings] = await Promise.all([getSessions(), getActiveSession(), getSettings()]);
  const name = viewer.profile?.full_name || viewer.user.email || "Staff";
  const writer = canWrite(viewer.role);

  return (
    <div className="min-h-screen">
      <Sidebar role={viewer.role} schoolName={settings?.school_name ?? "My School"} canCollect={writer} />
      <div className="lg:pl-[248px] print:pl-0">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-glass backdrop-blur-2xl backdrop-saturate-150">
          <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-3 pl-14 pr-3 sm:pr-6 lg:pl-8">
            <StudentSearch className="min-w-0 max-w-[420px] flex-1" canCollect={writer} />
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <SessionSwitcher sessions={sessions} activeId={active?.id ?? null} />
              <div className="hidden items-center gap-2.5 md:flex">
                <Avatar name={name} size="sm" />
                <div className="leading-tight">
                  <div className="max-w-[140px] truncate text-footnote font-semibold text-ink">{name}</div>
                  <div className="text-caption capitalize text-muted">{viewer.role}</div>
                </div>
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  title="Sign out"
                  aria-label="Sign out"
                  className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-fill hover:text-ink"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1320px] px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
