import { getViewer } from "@/lib/auth";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SETTINGS_TABS } from "@/components/layout/nav";

export async function SettingsTabs() {
  const viewer = await getViewer();
  const role = viewer?.profile?.role ?? null;
  const tabs = SETTINGS_TABS.filter((t) => !t.roles || (role && t.roles.includes(role)));
  if (tabs.length < 2) return null;
  return <SectionTabs tabs={tabs} />;
}
