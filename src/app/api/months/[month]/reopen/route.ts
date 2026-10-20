import { api, pathParam } from "@/server/http";
import { reopenMonth } from "@/server/services/admin";
import { month } from "@/server/validate";

/** Unfreeze a closed month. Admin only. */
export const POST = api<{ month: string }>("admin", async ({ params, viewer }) => reopenMonth(viewer, pathParam(month(), params.month)));
