import { ClassesView } from "./classes-view";

export const metadata = { title: "Classes" };

export default async function ClassesPage({ searchParams }: PageProps<"/classes">) {
  return <ClassesView sp={await searchParams} />;
}
