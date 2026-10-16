import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { defaulters } from "@/server/services/analytics";
import { flag, id, intParam } from "@/server/validate";

const Query = z.object({ session: id("Choose a session."), arrears: flag(false), limit: intParam(8, 1, 50) });

/** Students with the highest overdue amounts. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return defaulters(viewer, q.session, q.arrears, q.limit);
});
