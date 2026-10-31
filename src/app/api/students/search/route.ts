import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { search } from "@/server/services/students";
import { intParam } from "@/server/validate";

const Query = z.object({ q: z.string().trim().max(100).default(""), limit: intParam(12, 1, 50) });

/** Type-ahead search by name, admission no, father's name or phone. */
export const GET = api("caller", async ({ req, viewer }) => {
  const { q, limit } = readQuery(req, Query);
  return q ? search(viewer, q, limit) : [];
});
