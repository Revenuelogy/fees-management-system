import { api, pathParam } from "@/server/http";
import { closeMonth } from "@/server/services/admin";
import { month } from "@/server/validate";

/** Freeze an ended month's figures. Admin only. */
export const POST = api<{ month: string }>("admin", async ({ params, viewer }) => closeMonth(viewer, pathParam(month(), params.month)));
