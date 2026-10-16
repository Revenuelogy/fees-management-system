import { InstallmentView } from "./installment-view";

export const metadata = { title: "Installment" };

export default async function InstallmentPage({ params, searchParams }: PageProps<"/installments/[number]">) {
  const { number } = await params;
  return <InstallmentView number={number} sp={await searchParams} />;
}
