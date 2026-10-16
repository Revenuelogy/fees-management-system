import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { installmentsOverview } from "@/server/services/analytics";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Expected vs received vs gap per installment, on time / late. */
export const GET = api("staff", ({ req, viewer }) => installmentsOverview(viewer, readQuery(req, Query).session));
