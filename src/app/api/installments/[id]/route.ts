import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { deleteInstallment, updateInstallment } from "@/server/services/setup";
import { id, isoDate, requiredText } from "@/server/validate";

type P = { id: string };

const Body = z.object({ name: requiredText("Enter a name.", 100), due_date: isoDate("Enter a valid due date.") });

export const PATCH = api<P>("writer", async ({ req, params, viewer }) => updateInstallment(viewer, pathParam(id(), params.id), await readBody(req, Body)));

/** Delete an installment nothing is billed against. */
export const DELETE = api<P>("writer", async ({ params, viewer }) => deleteInstallment(viewer, pathParam(id(), params.id)));
