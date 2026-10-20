import { notFound } from "next/navigation";
import { param } from "@/lib/context";
import { isUuid } from "../../students/helpers";
import { CampaignView } from "./campaign-view";

export const metadata = { title: "Campaign" };

export default async function CampaignPage({ params, searchParams }: PageProps<"/recovery/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sp = await searchParams;
  return <CampaignView id={id} tab={param(sp.tab)} />;
}
