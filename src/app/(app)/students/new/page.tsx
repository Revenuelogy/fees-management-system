import { RequireRole } from "@/components/layout/app-shell";
import { NewStudent } from "./new-student";

export const metadata = { title: "Add student" };

export default function NewStudentPage() {
  return (
    <RequireRole role="writer">
      <NewStudent />
    </RequireRole>
  );
}
