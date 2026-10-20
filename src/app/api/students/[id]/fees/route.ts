import { z } from "zod";
import { api, pathParam, readQuery } from "@/server/http";
import { feePlan } from "@/server/services/students";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Fee plan: the student, enrolments, every fee line, the session's installments, fee heads and advance. */
export const GET = api<{ id: string }>("staff", async ({ req, params, viewer }) =>
  feePlan(viewer, pathParam(id(), params.id), readQuery(req, Query).session),
);
