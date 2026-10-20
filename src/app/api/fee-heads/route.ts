import { api, readBody } from "@/server/http";
import { FeeHeadBody } from "@/server/schemas/setup";
import { feeHeads } from "@/server/services/context";
import { addFeeHead } from "@/server/services/setup";

/** All fee heads in allocation priority order. */
export const GET = api("staff", ({ viewer }) => feeHeads(viewer));

export const POST = api("writer", async ({ req, viewer }) => addFeeHead(viewer, await readBody(req, FeeHeadBody)));
