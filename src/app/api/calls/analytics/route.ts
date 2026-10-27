import { api, readQuery } from "@/server/http";
import { PeriodQuery } from "@/server/schemas/recovery";
import { callAnalytics } from "@/server/services/recovery";

/** Calls in a period: per day, outcomes, promises, every caller's effort and result, and whether calling helps. */
export const GET = api("staff", ({ req, viewer }) => {
  const { from, to } = readQuery(req, PeriodQuery);
  return callAnalytics(viewer, from, to);
});
