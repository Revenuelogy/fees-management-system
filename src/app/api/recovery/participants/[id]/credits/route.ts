import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { credit } from "@/server/services/recovery";
import { id } from "@/server/validate";

const Body = z.object({ payment_id: id("Choose a receipt.") });

/** Count one of the student's receipts as paid because of the activity. */
export const POST = api<{ id: string }>("writer", async ({ req, params, viewer }) =>
  credit(viewer, pathParam(id(), params.id), (await readBody(req, Body)).payment_id),
);
