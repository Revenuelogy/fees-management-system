import { notFound } from "next/navigation";
import { isUuid } from "../../../../students/helpers";
import { CallView } from "./call-view";

export const metadata = { title: "Call" };

export default async function CallPage({ params }: PageProps<"/recovery/[id]/call/[parentId]">) {
  const { id, parentId } = await params;
  if (!isUuid(id) || !isUuid(parentId)) notFound();
  return <CallView campaignId={id} parentId={parentId} />;
}
