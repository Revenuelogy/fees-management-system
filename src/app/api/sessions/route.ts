import { z } from "zod";
import { api, readBody } from "@/server/http";
import { createSession, sessionsOverview } from "@/server/services/setup";
import { id, isoDate, optionalText, requiredText } from "@/server/validate";

/** Sessions with their installments and what they hold. */
export const GET = api("writer", ({ viewer }) => sessionsOverview(viewer));

const Body = z.object({
  name: requiredText("Enter a session name, for example 2027-28.", 50),
  start_date: isoDate("Enter valid start and end dates."),
  end_date: isoDate("Enter valid start and end dates."),
  installments: z.array(z.object({ name: optionalText(100), due_date: isoDate("Each installment needs a valid due date.") })).max(24),
  make_current: z.boolean().default(false),
  /** copy the fee structure from this session (matched by installment number) */
  copy_from: id("Unknown session.").nullable().default(null),
});

/** Create a session with its installments. */
export const POST = api("writer", async ({ req, viewer }) => createSession(viewer, await readBody(req, Body)));
