import { ClassView } from "./class-view";

export const metadata = { title: "Class" };

export default async function ClassPage({ params, searchParams }: PageProps<"/classes/[id]">) {
  const { id } = await params;
  return <ClassView id={id} sp={await searchParams} />;
}
