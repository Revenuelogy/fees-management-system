import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { snapshots } from "@/server/services/admin";
import { month } from "@/server/validate";

const Query = z.object({ from: month(), to: month() });

/** Closed (frozen) months in a range, with who closed them. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return snapshots(viewer, q.from, q.to);
});
