import { NewCampaign } from "./new-campaign";

export const metadata = { title: "New campaign" };

export default async function NewCampaignPage({ searchParams }: PageProps<"/recovery/new">) {
  const sp = await searchParams;
  return <NewCampaign kind={sp.kind === "activity" ? "activity" : "calls"} />;
}
