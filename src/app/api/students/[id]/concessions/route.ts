import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { applyConcession } from "@/server/services/students";
import { id } from "@/server/validate";

const Body = z
  .object({
    session_id: id("Unknown session."),
    fee_head_id: id("Choose a fee type.").nullable(),
    mode: z.enum(["percent", "amount", "clear"], { error: "Choose how to apply the concession." }),
    /** percent: 0-100; amount: paise per installment line; clear: ignored */
    value: z.number({ error: "Enter the concession." }).min(0, "Enter the concession.").default(0),
    from_installment: z.number().int().min(1, "Choose the installment to start from.").default(1),
  })
  .refine((b) => b.mode !== "percent" || b.value <= 100, "Enter a percentage between 0 and 100.")
  .refine((b) => b.mode !== "amount" || Number.isSafeInteger(b.value), "Enter the concession amount per installment line (₹).");

/** Apply a concession (percent or fixed amount per line) from an installment onwards, or clear it. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) =>
  applyConcession(viewer, pathParam(id(), params.id), await readBody(req, Body)),
);
