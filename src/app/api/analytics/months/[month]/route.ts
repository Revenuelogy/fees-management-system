import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { monthSummary } from "@/server/services/analytics";
import { flag, month } from "@/server/validate";

const Query = z.object({ carry: flag(true), arrears: flag(false) });

/** A month: expected, received, daily curve, classes, modes (frozen figures for closed months). */
export const GET = api<{ month: string }>("staff", async ({ req, params, viewer }) => {
  const q = readQuery(req, Query);
  return monthSummary(viewer, pathParam(month(), params.month), q.carry, q.arrears);
});
