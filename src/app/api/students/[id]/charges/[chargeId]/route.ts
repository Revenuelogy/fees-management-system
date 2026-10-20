import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { deleteCharge, updateCharge } from "@/server/services/students";
import { id, paise } from "@/server/validate";

type P = { id: string; chargeId: string };

const Body = z.object({
  amount: paise("Enter a valid amount (₹).").min(0, "Enter a valid amount (₹)."),
  concession: paise("Enter a valid concession (₹).").min(0, "Enter a valid concession (₹)."),
});

/** Change a fee line's amount or concession (allocations re-run automatically). */
export const PATCH = api<P>("writer", async ({ req, params, viewer }) => {
  const b = await readBody(req, Body);
  return updateCharge(viewer, pathParam(id(), params.id), pathParam(id(), params.chargeId), b.amount, b.concession);
});

export const DELETE = api<P>("writer", async ({ params, viewer }) =>
  deleteCharge(viewer, pathParam(id(), params.id), pathParam(id(), params.chargeId)),
);
