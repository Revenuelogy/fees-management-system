import { SectionTabs } from "@/components/layout/section-tabs";
import { SETUP_TABS } from "@/components/layout/nav";

export default function SetupLayout({ children }: LayoutProps<"/setup">) {
  return (
    <>
      <SectionTabs tabs={SETUP_TABS} />
      {children}
    </>
  );
}
