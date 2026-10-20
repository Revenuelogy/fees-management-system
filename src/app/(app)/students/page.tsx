import { StudentsView } from "./students-view";

export const metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  return <StudentsView sp={await searchParams} />;
}
