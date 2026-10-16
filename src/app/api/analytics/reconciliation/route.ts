import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { reconciliation } from "@/server/services/analytics";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Live consistency checks for a session. */
export const GET = api("staff", ({ req, viewer }) => reconciliation(viewer, readQuery(req, Query).session));
