import { z } from "zod";
import { api, readBody, readQuery } from "@/server/http";
import { promote, promotePreview } from "@/server/services/setup";
import { id } from "@/server/validate";

const Query = z.object({ from: id("Choose both sessions."), to: id("Choose both sessions.") });

/** Students per class in `from`, and which target classes have fees in `to`. */
export const GET = api("writer", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return promotePreview(viewer, q.from, q.to);
});

const Body = z.object({
  from: id("Choose both sessions."),
  to: id("Choose both sessions."),
  /** to_class null = the class passes out */
  mapping: z.array(z.object({ from_class: id("Unknown class."), to_class: id("Unknown class.").nullable() })).max(500),
  generate: z.boolean().default(true),
});

/** Enrol a session's students in the next session using a class mapping. */
export const POST = api("writer", async ({ req, viewer }) => promote(viewer, await readBody(req, Body)));
