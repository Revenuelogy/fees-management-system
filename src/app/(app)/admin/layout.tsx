import { SettingsTabs } from "@/components/layout/settings-tabs";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <SettingsTabs />
      {children}
    </>
  );
}
