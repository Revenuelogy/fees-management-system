import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { monthNonPayers } from "@/server/services/analytics";
import { flag, month } from "@/server/validate";

const Query = z.object({ carry: flag(true), arrears: flag(false) });

/** Students who owed money in the month but paid nothing. */
export const GET = api<{ month: string }>("staff", async ({ req, params, viewer }) => {
  const q = readQuery(req, Query);
  return monthNonPayers(viewer, pathParam(month(), params.month), q.carry, q.arrears);
});
