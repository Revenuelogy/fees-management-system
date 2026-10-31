import { api, readQuery } from "@/server/http";
import { PeriodQuery } from "@/server/schemas/recovery";
import { summary } from "@/server/services/recovery";

/** Money received in a period and what brought it in (a call, an activity, on their own), calls made, activities. */
export const GET = api("staff", ({ req, viewer }) => {
  const { from, to } = readQuery(req, PeriodQuery);
  return summary(viewer, from, to);
});
