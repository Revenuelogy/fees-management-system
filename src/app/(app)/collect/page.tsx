import { RequireRole } from "@/components/layout/app-shell";
import { CollectView } from "./collect-view";

export const metadata = { title: "Collect fee" };

export default function CollectPage() {
  return (
    <RequireRole role="writer">
      <CollectView />
    </RequireRole>
  );
}
