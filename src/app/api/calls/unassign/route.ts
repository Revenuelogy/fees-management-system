import { api, readBody } from "@/server/http";
import { UnassignCallBody } from "@/server/schemas/recovery";
import { unassignCall } from "@/server/services/recovery";

/** Take a family off the list it was given to for a day (today when no date). */
export const POST = api("staff", async ({ req, viewer }) => {
  const b = await readBody(req, UnassignCallBody);
  return unassignCall(viewer, b.parent_id, b.date);
});
