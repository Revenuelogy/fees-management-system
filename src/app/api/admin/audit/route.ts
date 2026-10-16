import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { auditLog } from "@/server/services/admin";
import { intParam } from "@/server/validate";

/** Latest audit entries (payments, cancellations, imports, setting and role changes). Admin only. */
export const GET = api("admin", ({ req, viewer }) => auditLog(viewer, readQuery(req, z.object({ limit: intParam(50, 1, 500) })).limit));
