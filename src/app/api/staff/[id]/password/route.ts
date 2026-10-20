import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { resetPassword } from "@/server/services/admin";
import { id } from "@/server/validate";

const Body = z.object({
  password: z.string({ error: "The new password must be at least 8 characters." }).min(8, "The new password must be at least 8 characters.").max(200),
});

/** Set a new password for a staff login (signs it out everywhere). Admin only. */
export const POST = api<{ id: string }>("admin", async ({ req, params, viewer }) =>
  resetPassword(viewer, pathParam(id(), params.id), (await readBody(req, Body)).password),
);
