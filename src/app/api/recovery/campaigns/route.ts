import { z } from "zod";
import { api, readBody, readQuery } from "@/server/http";
import { CampaignCreateBody } from "@/server/schemas/recovery";
import { campaigns, createCampaign } from "@/server/services/recovery";
import { flag } from "@/server/validate";

/** Campaigns and activities without their figures (for pickers); `active=1` only running ones. */
export const GET = api("staff", ({ req, viewer }) => campaigns(viewer, readQuery(req, z.object({ active: flag(false) })).active));

/** Start a call campaign or a student activity (optionally with `student_ids` taking part from the start). */
export const POST = api("writer", async ({ req, viewer }) => {
  const { kind, student_ids, ...settings } = await readBody(req, CampaignCreateBody);
  return createCampaign(viewer, kind, settings, [...new Set(student_ids)]);
});
