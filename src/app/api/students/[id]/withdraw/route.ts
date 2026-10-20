import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { withdraw } from "@/server/services/students";
import { id, isoDate } from "@/server/validate";

const Body = z.object({ left_on: isoDate("Enter the date the student left."), waive: z.boolean() });

/** Mark as left; optionally waive installments due after the leaving date. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) => {
  const b = await readBody(req, Body);
  return withdraw(viewer, pathParam(id(), params.id), b.left_on, b.waive);
});
