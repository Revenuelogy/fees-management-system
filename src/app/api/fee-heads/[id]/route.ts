import { api, pathParam, readBody } from "@/server/http";
import { deleteFeeHead, updateFeeHead } from "@/server/services/setup";
import { id } from "@/server/validate";
import { FeeHeadBody } from "@/server/schemas/setup";

type P = { id: string };

/** Changing the priority re-runs payment allocation for every student. */
export const PATCH = api<P>("writer", async ({ req, params, viewer }) => updateFeeHead(viewer, pathParam(id(), params.id), await readBody(req, FeeHeadBody)));

export const DELETE = api<P>("writer", async ({ params, viewer }) => deleteFeeHead(viewer, pathParam(id(), params.id)));
