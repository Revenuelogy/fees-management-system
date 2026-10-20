import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { balances } from "@/server/services/analytics";
import { id } from "@/server/validate";

const Query = z.object({
  session: id("Choose a session."),
  class: id("Unknown class.").optional(),
  section: z.string().max(20).optional(),
});

/** Per-student expected, received, pending, overdue and previous dues for a session. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return balances(viewer, q.session, { classId: q.class, section: q.section });
});
