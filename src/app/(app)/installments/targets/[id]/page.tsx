import { TargetView } from "./target-view";

export const metadata = { title: "Target" };

export default async function TargetPage({ params }: PageProps<"/installments/targets/[id]">) {
  const { id } = await params;
  return <TargetView id={id} />;
}
