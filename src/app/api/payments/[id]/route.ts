import { api, pathParam } from "@/server/http";
import { receipt } from "@/server/services/payments";
import { id } from "@/server/validate";

/** A receipt with the student's balances, allocations, who recorded it and any cancellation. */
export const GET = api<{ id: string }>("staff", async ({ params, viewer }) => receipt(viewer, pathParam(id(), params.id)));
