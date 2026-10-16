import { z } from "zod";
import { api, readBody, readQuery } from "@/server/http";
import { StudentBody } from "@/server/schemas/students";
import { create, list } from "@/server/services/students";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Unknown session.").optional() });

/** Every student (any status) with their class in `session`. */
export const GET = api("staff", ({ req, viewer }) => list(viewer, readQuery(req, Query).session ?? null));

/** Add a student; with `enrolment` they are enrolled (and charged) in that session. */
export const POST = api("writer", async ({ req, viewer }) => {
  const body = await readBody(req, StudentBody);
  return create(viewer, body.student, body.enrolment);
});
