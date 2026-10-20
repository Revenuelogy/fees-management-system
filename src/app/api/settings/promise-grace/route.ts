import { z } from "zod";
import { api, readBody } from "@/server/http";
import { updatePromiseGrace } from "@/server/services/admin";

const Body = z.object({
  promise_grace_days: z.number({ error: "Enter 0 to 30 days." }).int("Enter 0 to 30 days.").min(0, "Enter 0 to 30 days.").max(30, "Enter 0 to 30 days."),
});

/** How many days after a promised date a payment still keeps the promise. Admin only. */
export const PUT = api("admin", async ({ req, viewer }) => updatePromiseGrace(viewer, (await readBody(req, Body)).promise_grace_days));
