import { PaymentsView } from "./payments-view";

export const metadata = { title: "Payments & receipts" };

export default async function PaymentsPage({ searchParams }: PageProps<"/payments">) {
  return <PaymentsView sp={await searchParams} />;
}
