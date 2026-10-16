import { notFound } from "next/navigation";
import { RequireRole } from "@/components/layout/app-shell";
import { isUuid } from "../../students/helpers";
import { CollectStudent } from "./collect-student";

export const metadata = { title: "Collect fee" };

export default async function CollectStudentPage({ params }: PageProps<"/collect/[studentId]">) {
  const { studentId } = await params;
  if (!isUuid(studentId)) notFound();
  return (
    <RequireRole role="writer">
      <CollectStudent studentId={studentId} />
    </RequireRole>
  );
}
