import { DashboardView } from "./dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  return <DashboardView sp={await searchParams} />;
}
