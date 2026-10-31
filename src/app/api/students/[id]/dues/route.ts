import { api, pathParam } from "@/server/http";
import { dues } from "@/server/services/students";
import { id } from "@/server/validate";

/** Every fee line of the student with paid and remaining amounts, oldest first. */
export const GET = api<{ id: string }>("caller", async ({ params, viewer }) => dues(viewer, pathParam(id(), params.id)));
