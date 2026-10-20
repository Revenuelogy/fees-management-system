import { z } from "zod";
import { api, readBody, readQuery } from "@/server/http";
import { feeStructure, saveStructure } from "@/server/services/setup";
import { id, paise } from "@/server/validate";

const Query = z.object({ session: id("Choose a session."), class: id("Choose a class.") });

/** One class's amounts per installment and fee head in a session. */
export const GET = api("writer", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return feeStructure(viewer, q.session, q.class);
});

const Body = z.object({
  session_id: id("Choose a session."),
  class_id: id("Choose a class."),
  /** every cell of the grid; 0 removes the amount */
  cells: z
    .array(z.object({ installment_id: id(), fee_head_id: id(), amount: paise("Amounts must be valid rupee amounts.").min(0, "Amounts cannot be negative.") }))
    .max(2000),
});

export const PUT = api("writer", async ({ req, viewer }) => {
  const b = await readBody(req, Body);
  return saveStructure(viewer, b.session_id, b.class_id, b.cells);
});
