import { notFound } from "next/navigation";
import { RequireRole } from "@/components/layout/app-shell";
import { isUuid } from "../../helpers";
import { FeesView } from "./fees-view";

export const metadata = { title: "Fee plan" };

export default async function StudentFeesPage({ params, searchParams }: PageProps<"/students/[id]/fees">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  return (
    <RequireRole role="writer">
      <FeesView id={id} sp={sp} />
    </RequireRole>
  );
}
