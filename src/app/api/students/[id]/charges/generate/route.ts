import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { regenerate } from "@/server/services/students";
import { id } from "@/server/validate";

const Body = z.object({ session_id: id("Unknown session."), overwrite: z.boolean().default(false) });

/** (Re)create the student's fee lines from their class fee structure. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) => {
  const b = await readBody(req, Body);
  return regenerate(viewer, pathParam(id(), params.id), b.session_id, b.overwrite);
});
