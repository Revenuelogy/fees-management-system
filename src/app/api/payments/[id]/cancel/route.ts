import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { cancel } from "@/server/services/payments";
import { id, requiredText } from "@/server/validate";

const Body = z.object({ reason: requiredText("Give a reason for cancelling (e.g. cheque bounced, wrong student).", 500) });

/** Cancel a receipt with a reason (a reversing entry dated today; the original stays on record). */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) => {
  await cancel(viewer, pathParam(id(), params.id), (await readBody(req, Body)).reason);
  return { ok: true, message: "Receipt cancelled. The fees it cleared are due again." };
});
