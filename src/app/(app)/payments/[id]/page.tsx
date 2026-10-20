import { notFound } from "next/navigation";
import { isUuid } from "../../students/helpers";
import { ReceiptView } from "./receipt-view";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }: PageProps<"/payments/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  return <ReceiptView id={id} sp={await searchParams} />;
}
