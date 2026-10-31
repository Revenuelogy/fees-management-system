import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { addCharge } from "@/server/services/students";
import { id, optionalText, paise } from "@/server/validate";

const Body = z.object({
  installment_id: id("Choose an installment."),
  fee_head_id: id("Choose a fee type."),
  amount: paise("Enter an amount greater than zero (₹)."),
  concession: paise("Enter a valid concession (₹).").min(0, "Enter a valid concession (₹).").default(0),
  note: optionalText(500),
});

/** Add a manual fee line. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) =>
  addCharge(viewer, pathParam(id(), params.id), await readBody(req, Body)),
);
