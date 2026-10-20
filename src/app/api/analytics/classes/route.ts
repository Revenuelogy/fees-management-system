import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { classSummary } from "@/server/services/analytics";
import { flag, id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session."), arrears: flag(false) });

/** Class-wise expected, received, pending, status counts and paid-% bands. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return classSummary(viewer, q.session, q.arrears);
});
