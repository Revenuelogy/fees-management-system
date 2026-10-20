import { api, pathParam } from "@/server/http";
import { makeCurrent } from "@/server/services/setup";
import { id } from "@/server/validate";

/** Mark the running session. */
export const POST = api<{ id: string }>("writer", async ({ params, viewer }) => makeCurrent(viewer, pathParam(id(), params.id)));
