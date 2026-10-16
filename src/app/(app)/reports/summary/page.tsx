import { SummaryView } from "./summary-view";

export const metadata = { title: "Owner summary" };

export default async function OwnerSummaryPage({ searchParams }: PageProps<"/reports/summary">) {
  return <SummaryView sp={await searchParams} />;
}
