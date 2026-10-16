import { notFound } from "next/navigation";
import { RequireRole } from "@/components/layout/app-shell";
import { isUuid } from "../../helpers";
import { EditStudent } from "./edit-student";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params, searchParams }: PageProps<"/students/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  return (
    <RequireRole role="writer">
      <EditStudent id={id} sp={sp} />
    </RequireRole>
  );
}
