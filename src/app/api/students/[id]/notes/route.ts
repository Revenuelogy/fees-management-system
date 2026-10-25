import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { addNote } from "@/server/services/students";
import { id, optionalDate, paise, requiredText } from "@/server/validate";

const Body = z.object({
  note: requiredText("Write a note.", 2000),
  promised_date: optionalDate("Promised date is not a valid date."),
  promised_amount: paise("Promised amount is not a valid rupee amount.").positive("Promised amount is not a valid rupee amount.").nullable(),
});

/** Add a note or payment promise. */
export const POST = api<{ id: string }>("caller", async ({ req, params, viewer }) => {
  await addNote(viewer, pathParam(id(), params.id), await readBody(req, Body));
  return { ok: true, message: "Note saved." };
});
