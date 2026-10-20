import { api, pathParam } from "@/server/http";
import { targetProgress } from "@/server/services/analytics";
import { deleteTarget } from "@/server/services/targets";
import { id } from "@/server/validate";

/** Progress towards one target, with the students who would close the gap. */
export const GET = api<{ id: string }>("staff", async ({ params, viewer }) => targetProgress(viewer, pathParam(id(), params.id)));

export const DELETE = api<{ id: string }>("writer", async ({ params, viewer }) => deleteTarget(viewer, pathParam(id(), params.id)));
