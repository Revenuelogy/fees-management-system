import { AppShell } from "@/components/layout/app-shell";

// Signed-in screens. The shell loads the viewer, sessions and settings from /api/bootstrap; each page
// loads its own data from the API.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
