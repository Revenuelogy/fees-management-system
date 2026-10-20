import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { installmentDetail } from "@/server/services/analytics";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Installment N of a session: gap by class and group, who to call first, payment timing. */
export const GET = api<{ number: string }>("staff", async ({ req, params, viewer }) => {
  const n = pathParam(z.coerce.number().int().positive(), params.number);
  return installmentDetail(viewer, readQuery(req, Query).session, n);
});
