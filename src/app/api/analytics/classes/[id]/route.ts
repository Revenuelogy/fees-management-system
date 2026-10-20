import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { classDetail } from "@/server/services/analytics";
import { flag, id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session."), arrears: flag(false) });

/** One class: KPIs, sections, month strip and installment strip. */
export const GET = api<{ id: string }>("staff", async ({ req, params, viewer }) => {
  const q = readQuery(req, Query);
  return classDetail(viewer, q.session, pathParam(id(), params.id), q.arrears);
});
