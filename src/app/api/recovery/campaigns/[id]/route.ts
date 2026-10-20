import { api, pathParam, readBody } from "@/server/http";
import { CampaignFields } from "@/server/schemas/recovery";
import { campaign, deleteCampaign, updateCampaign } from "@/server/services/recovery";
import { id } from "@/server/validate";

type P = { id: string };

/** A call campaign with its call list and results, or an activity with its participants. */
export const GET = api<P>("staff", async ({ params, viewer }) => campaign(viewer, pathParam(id(), params.id)));

/** Change the rules, dates or status (close / reopen). */
export const PUT = api<P>("writer", async ({ req, params, viewer }) => updateCampaign(viewer, pathParam(id(), params.id), await readBody(req, CampaignFields)));

/** Delete a campaign that has no calls and no credited receipts. */
export const DELETE = api<P>("writer", async ({ params, viewer }) => deleteCampaign(viewer, pathParam(id(), params.id)));
