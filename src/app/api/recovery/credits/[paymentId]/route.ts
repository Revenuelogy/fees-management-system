import { api, pathParam } from "@/server/http";
import { uncredit } from "@/server/services/recovery";
import { id } from "@/server/validate";

/** Stop counting a receipt for its activity. */
export const DELETE = api<{ paymentId: string }>("writer", async ({ params, viewer }) => uncredit(viewer, pathParam(id(), params.paymentId)));
