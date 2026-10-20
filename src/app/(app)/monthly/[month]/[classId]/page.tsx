import { notFound } from "next/navigation";
import { MonthClassView } from "./month-class-view";

export const metadata = { title: "Class in month" };

export default async function MonthClassPage({ params, searchParams }: PageProps<"/monthly/[month]/[classId]">) {
  const { month, classId } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  return <MonthClassView month={month} classId={classId} sp={await searchParams} />;
}
