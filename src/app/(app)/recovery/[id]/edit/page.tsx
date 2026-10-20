import { notFound } from "next/navigation";
import { isUuid } from "../../../students/helpers";
import { EditCampaign } from "./edit-campaign";

export const metadata = { title: "Edit campaign" };

export default async function EditCampaignPage({ params }: PageProps<"/recovery/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <EditCampaign id={id} />;
}
