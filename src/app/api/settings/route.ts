import { z } from "zod";
import { api, readBody } from "@/server/http";
import { settings } from "@/server/services/context";
import { updateSchoolProfile } from "@/server/services/admin";
import { EMAIL_RE, optionalText, requiredText } from "@/server/validate";

/** School profile, receipt settings, time zone and allocation rule. */
export const GET = api("staff", ({ viewer }) => settings(viewer));

const Body = z.object({
  school_name: requiredText("Enter the school name.", 200),
  address: optionalText(500),
  phone: optionalText(100),
  email: optionalText(254).refine((v) => v === null || EMAIL_RE.test(v), "The email address does not look right."),
  affiliation: optionalText(200),
  receipt_prefix: z
    .string({ error: "Enter a receipt prefix (for example R or SPS)." })
    .trim()
    .min(1, "Enter a receipt prefix (for example R or SPS).")
    .regex(/^[A-Za-z0-9/_.-]{1,12}$/, "Receipt prefix: up to 12 letters or digits (/, -, _ and . are allowed), no spaces."),
  receipt_footer: optionalText(500),
  session_start_month: z.number({ error: "Choose the month a session starts." }).int().min(1, "Choose the month a session starts.").max(12, "Choose the month a session starts."),
});

/** Update the school profile shown on receipts. Admin only. */
export const PUT = api("admin", async ({ req, viewer }) => updateSchoolProfile(viewer, await readBody(req, Body)));
