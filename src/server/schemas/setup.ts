import "server-only";
import { z } from "zod";
import { requiredText } from "@/server/validate";

export const ClassBody = z.object({
  name: requiredText("Enter a class name.", 100),
  sort_order: z.number({ error: "Sort order must be a whole number." }).int("Sort order must be a whole number."),
  is_active: z.boolean().default(true),
});

export const FeeHeadBody = z.object({
  name: requiredText("Enter a fee type name.", 100),
  priority: z
    .number({ error: "Priority must be a whole number (0 or more)." })
    .int("Priority must be a whole number (0 or more).")
    .min(0, "Priority must be a whole number (0 or more)."),
  is_active: z.boolean().default(true),
});
