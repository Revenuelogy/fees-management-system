import { MonthlyView } from "./monthly-view";

export const metadata = { title: "Months" };

export default async function MonthlyPage({ searchParams }: PageProps<"/monthly">) {
  return <MonthlyView sp={await searchParams} />;
}
