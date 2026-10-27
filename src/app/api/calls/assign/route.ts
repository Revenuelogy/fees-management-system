import { api, readBody } from "@/server/http";
import { AssignCallBody } from "@/server/schemas/recovery";
import { assignCall } from "@/server/services/recovery";

/** Give a family (on the day's list or not) to a caller for a day, with a note for them. */
export const POST = api("staff", async ({ req, viewer }) => assignCall(viewer, await readBody(req, AssignCallBody)));
