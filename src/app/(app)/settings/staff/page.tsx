import { RequireRole } from "@/components/layout/app-shell";
import { StaffView } from "./staff-view";

export const metadata = { title: "Staff & roles" };

export default function StaffPage() {
  return (
    <RequireRole role="admin">
      <StaffView />
    </RequireRole>
  );
}
