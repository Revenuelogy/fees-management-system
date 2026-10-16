import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { addInstallment } from "@/server/services/setup";
import { id, isoDate, optionalText } from "@/server/validate";

const Body = z.object({
  number: z.number({ error: "The installment number must be 1 or more." }).int().min(1, "The installment number must be 1 or more."),
  name: optionalText(100),
  due_date: isoDate("Enter a valid due date."),
});

export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) => addInstallment(viewer, pathParam(id(), params.id), await readBody(req, Body)));
