import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { monthPayments } from "@/server/services/analytics";
import { flag, month } from "@/server/validate";

const Query = z.object({ unassigned: flag(false) });

/** Payments received in the month with what each paid for. `unassigned=1`: students not in a class. */
export const GET = api<{ month: string }>("staff", async ({ req, params, viewer }) => {
  return monthPayments(viewer, pathParam(month(), params.month), readQuery(req, Query).unassigned);
});
