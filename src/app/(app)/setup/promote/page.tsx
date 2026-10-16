import { PromoteView } from "./promote-view";

export const metadata = { title: "Promote students" };

export default async function PromotePage({ searchParams }: PageProps<"/setup/promote">) {
  return <PromoteView sp={await searchParams} />;
}
