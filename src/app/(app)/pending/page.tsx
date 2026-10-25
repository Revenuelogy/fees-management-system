import { PendingView } from "./pending-view";

export const metadata = { title: "Fees due" };

export default async function PendingPage({ searchParams }: PageProps<"/pending">) {
  return <PendingView sp={await searchParams} />;
}
