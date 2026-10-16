import { z } from "zod";
import { api, readBody, readQuery } from "@/server/http";
import { targets } from "@/server/services/analytics";
import { createTarget } from "@/server/services/targets";
import { id, isoDate, optionalText } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Collection targets of a session, each with its progress. */
export const GET = api("staff", ({ req, viewer }) => targets(viewer, readQuery(req, Query).session));

const Body = z.object({
  session_id: id("Choose a session."),
  name: optionalText(200),
  target_pct: z.number({ error: "Enter a target between 1 and 100%." }).gt(0, "Enter a target between 1 and 100%.").max(100, "Enter a target between 1 and 100%."),
  target_date: isoDate("Choose the date the target applies to."),
});

export const POST = api("writer", async ({ req, viewer }) => createTarget(viewer, await readBody(req, Body)));
