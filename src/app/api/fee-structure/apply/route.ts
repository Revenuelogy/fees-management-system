import { z } from "zod";
import { api, readBody } from "@/server/http";
import { applyStructure } from "@/server/services/setup";
import { id } from "@/server/validate";

const Body = z.object({
  session_id: id("Choose a session."),
  /** null = every class */
  class_id: id("Choose a class.").nullable(),
  /** also update or remove structure-generated lines that no longer match */
  overwrite: z.boolean().default(false),
});

/** Create students' charges from the fee structure. */
export const POST = api("writer", async ({ req, viewer }) => {
  const b = await readBody(req, Body);
  return applyStructure(viewer, b.session_id, b.class_id, b.overwrite);
});
