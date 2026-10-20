import { ImportView } from "./import-view";

export const metadata = { title: "Import data" };

export default async function ImportPage({ searchParams }: PageProps<"/setup/import">) {
  return <ImportView sp={await searchParams} />;
}
