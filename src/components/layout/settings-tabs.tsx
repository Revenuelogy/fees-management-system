"use client";

import { useApp } from "@/components/layout/app-shell";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SETTINGS_TABS } from "@/components/layout/nav";

export function SettingsTabs() {
  const { viewer } = useApp();
  const tabs = SETTINGS_TABS.filter((t) => !t.roles || t.roles.includes(viewer.role));
  if (tabs.length < 2) return null;
  return <SectionTabs tabs={tabs} />;
}
