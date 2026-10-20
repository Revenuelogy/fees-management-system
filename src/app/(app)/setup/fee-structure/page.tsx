import { FeeStructureView } from "./fee-structure-view";

export const metadata = { title: "Fee structure" };

export default async function FeeStructurePage({ searchParams }: PageProps<"/setup/fee-structure">) {
  return <FeeStructureView sp={await searchParams} />;
}
