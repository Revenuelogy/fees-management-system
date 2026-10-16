import { PendingView } from "./pending-view";

export const metadata = { title: "Pending fees" };

export default async function PendingPage({ searchParams }: PageProps<"/pending">) {
  return <PendingView sp={await searchParams} />;
}
