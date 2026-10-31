import { api, readQuery } from "@/server/http";
import { DayQuery } from "@/server/schemas/recovery";
import { assignmentsOn } from "@/server/services/recovery";

/** Who has which families on a day (today when no date), with every staff member who makes calls. */
export const GET = api("staff", ({ req, viewer }) => assignmentsOn(viewer, readQuery(req, DayQuery).date));
