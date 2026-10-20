import { RequireRole } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SETUP_TABS } from "@/components/layout/nav";

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  return (
    <RequireRole role="writer">
      <SectionTabs tabs={SETUP_TABS} />
      {children}
    </RequireRole>
  );
}
