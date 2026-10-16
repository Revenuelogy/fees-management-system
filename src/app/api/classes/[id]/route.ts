import { api, pathParam, readBody } from "@/server/http";
import { deleteClass, updateClass } from "@/server/services/setup";
import { id } from "@/server/validate";
import { ClassBody } from "@/server/schemas/setup";

type P = { id: string };

export const PATCH = api<P>("writer", async ({ req, params, viewer }) => updateClass(viewer, pathParam(id(), params.id), await readBody(req, ClassBody)));

/** Delete a class no student was ever enrolled in. */
export const DELETE = api<P>("writer", async ({ params, viewer }) => deleteClass(viewer, pathParam(id(), params.id)));
