import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { addOpeningDue } from "@/server/services/students";
import { id, optionalText, paise } from "@/server/validate";

const Body = z.object({
  session_id: id("Choose the year the old balance is from."),
  amount: paise("Enter an amount greater than zero (₹)."),
  fee_head: optionalText(100).transform((v) => v ?? "Previous Dues"),
  note: optionalText(500),
});

/** Record unpaid dues from an earlier session (opening balance). */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) =>
  addOpeningDue(viewer, pathParam(id(), params.id), await readBody(req, Body)),
);
