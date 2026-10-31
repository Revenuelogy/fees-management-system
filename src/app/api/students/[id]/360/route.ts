import { api, pathParam } from "@/server/http";
import { student360 } from "@/server/services/students";
import { id } from "@/server/validate";

/** Student 360: balances, installment ladder, payments with allocations, dues by session, notes, habit. */
export const GET = api<{ id: string }>("caller", async ({ params, viewer }) => student360(viewer, pathParam(id(), params.id)));
