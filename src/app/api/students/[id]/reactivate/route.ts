import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { reactivate } from "@/server/services/students";
import { id } from "@/server/validate";

/** Re-activate a student who left; optionally restore the waived fee lines. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) => {
  const { restore } = await readBody(req, z.object({ restore: z.boolean() }));
  return reactivate(viewer, pathParam(id(), params.id), restore);
});
