import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { classesOverview } from "@/server/services/setup";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Unknown session.").optional() });

/** Classes and fee heads with how much uses them (things in use cannot be deleted). */
export const GET = api("writer", ({ req, viewer }) => classesOverview(viewer, readQuery(req, Query).session ?? null));
