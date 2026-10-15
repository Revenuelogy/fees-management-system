import { SettingsTabs } from "@/components/layout/settings-tabs";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
