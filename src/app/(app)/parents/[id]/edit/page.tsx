import { notFound } from "next/navigation";
import { isUuid } from "../../../students/helpers";
import { EditParent } from "./edit-parent";

export const metadata = { title: "Manage family" };

export default async function EditParentPage({ params, searchParams }: PageProps<"/parents/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <EditParent id={id} sp={await searchParams} />;
}
