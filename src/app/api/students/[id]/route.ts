import { z } from "zod";
import { api, pathParam, readBody, readQuery } from "@/server/http";
import { StudentBody } from "@/server/schemas/students";
import { get, remove, update } from "@/server/services/students";
import { id } from "@/server/validate";

type P = { id: string };

/** The student's record, with their enrolment in `session`. */
export const GET = api<P>("staff", async ({ req, params, viewer }) => {
  const { session } = readQuery(req, z.object({ session: id("Unknown session.").optional() }));
  return get(viewer, pathParam(id(), params.id), session ?? null);
});

/** Save details; with `enrolment`, also update the class in that session (fee charges follow the class). */
export const PUT = api<P>("writer", async ({ req, params, viewer }) => {
  const body = await readBody(req, StudentBody);
  return update(viewer, pathParam(id(), params.id), body.student, body.enrolment);
});

/** Delete a student who has no receipts. `?confirm=` must repeat the admission number. */
export const DELETE = api<P>("writer", async ({ req, params, viewer }) => {
  const { confirm } = readQuery(req, z.object({ confirm: z.string().default("") }));
  await remove(viewer, pathParam(id(), params.id), confirm);
});
