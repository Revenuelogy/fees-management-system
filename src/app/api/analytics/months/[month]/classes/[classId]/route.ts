import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { monthClassDetail } from "@/server/services/analytics";
import { flag, id, month } from "@/server/validate";

const Query = z.object({ carry: flag(true), arrears: flag(false) });

/** Every student of a class in a month: paid, what it paid for, balance after, status. */
export const GET = api<{ month: string; classId: string }>("staff", async ({ req, params, viewer }) => {
  const q = readQuery(req, Query);
  return monthClassDetail(viewer, pathParam(month(), params.month), pathParam(id(), params.classId), q.carry, q.arrears);
});
