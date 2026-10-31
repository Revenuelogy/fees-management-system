import { HomeView } from "./home-view";

export const metadata = { title: "Home" };

export default async function HomePage({ searchParams }: PageProps<"/">) {
  return <HomeView sp={await searchParams} />;
}
