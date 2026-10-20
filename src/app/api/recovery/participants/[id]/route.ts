import { api, pathParam, readBody } from "@/server/http";
import { ParticipantPatch } from "@/server/schemas/recovery";
import { removeParticipant, updateParticipant } from "@/server/services/recovery";
import { id } from "@/server/validate";

type P = { id: string };

/** Record the response of a participant (fees deposited, part, declined) with a note. */
export const PATCH = api<P>("writer", async ({ req, params, viewer }) => updateParticipant(viewer, pathParam(id(), params.id), await readBody(req, ParticipantPatch)));

/** Take a student out of the activity (credited receipts are released). */
export const DELETE = api<P>("writer", async ({ params, viewer }) => removeParticipant(viewer, pathParam(id(), params.id)));
