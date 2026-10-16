import { notFound } from "next/navigation";
import { isUuid } from "../helpers";
import { StudentView } from "./student-view";

export const metadata = { title: "Student" };

export default async function Student360Page({ params, searchParams }: PageProps<"/students/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <StudentView id={id} sp={await searchParams} />;
}
