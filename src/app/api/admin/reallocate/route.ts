import { api } from "@/server/http";
import { rerunAllocation } from "@/server/services/admin";

/** Rebuild the allocation of every payment. Admin only. */
export const POST = api("admin", ({ viewer }) => rerunAllocation(viewer));
