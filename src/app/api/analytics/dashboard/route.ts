import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { dashboard } from "@/server/services/analytics";
import { flag, id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session."), arrears: flag(false) });

/** Session KPIs, status counts, classes, monthly trend, fee heads and payment modes. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return dashboard(viewer, q.session, q.arrears);
});
