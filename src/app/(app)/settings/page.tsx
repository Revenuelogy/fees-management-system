import { RequireRole } from "@/components/layout/app-shell";
import { SettingsView } from "./settings-view";

export const metadata = { title: "School settings" };

export default function SettingsPage() {
  return (
    <RequireRole role="admin">
      <SettingsView />
    </RequireRole>
  );
}
