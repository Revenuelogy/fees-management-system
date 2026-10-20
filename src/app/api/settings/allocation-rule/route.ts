import { z } from "zod";
import { api, readBody } from "@/server/http";
import { updateAllocationRule } from "@/server/services/admin";

const Body = z.object({ allocation_order: z.enum(["oldest_first", "current_first"], { error: "Choose an allocation rule." }) });

/** Change which dues a payment clears first (re-matches every payment). Admin only. */
export const PUT = api("admin", async ({ req, viewer }) => updateAllocationRule(viewer, (await readBody(req, Body)).allocation_order));
