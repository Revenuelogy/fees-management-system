import { z } from "zod";
import { api, readBody } from "@/server/http";
import { createStaff, staff } from "@/server/services/admin";
import { EMAIL_RE, requiredText } from "@/server/validate";

/** Staff logins with their roles and last sign-in. Admin only. */
export const GET = api("admin", ({ viewer }) => staff(viewer));

const Body = z.object({
  email: z.string({ error: "Enter a valid email address." }).trim().toLowerCase().regex(EMAIL_RE, "Enter a valid email address.").max(254),
  full_name: requiredText("Enter the staff member's name.", 200),
  password: z.string({ error: "The temporary password must be at least 8 characters." }).min(8, "The temporary password must be at least 8 characters.").max(200),
  role: z.enum(["admin", "accountant", "principal", "teacher"], { error: "Choose a role." }).nullable(),
});

/** Create a staff login. */
export const POST = api("admin", async ({ req, viewer }) => createStaff(viewer, await readBody(req, Body)));
