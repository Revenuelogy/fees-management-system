import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { deleteSession, updateSession } from "@/server/services/setup";
import { id, isoDate, requiredText } from "@/server/validate";

type P = { id: string };

const Body = z.object({
  name: requiredText("Enter a session name.", 50),
  start_date: isoDate("Enter valid start and end dates."),
  end_date: isoDate("Enter valid start and end dates."),
});

export const PATCH = api<P>("writer", async ({ req, params, viewer }) => updateSession(viewer, pathParam(id(), params.id), await readBody(req, Body)));

/** Delete a session that holds no enrolments, payments or charges. */
export const DELETE = api<P>("writer", async ({ params, viewer }) => deleteSession(viewer, pathParam(id(), params.id)));
