import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { feePosition } from "@/server/services/analytics";
import { id, optionalText } from "@/server/validate";

const Query = z.object({
  session: id("Choose a session."),
  class: id("Unknown class.").nullish(),
  section: optionalText(10),
});

/** Every total of the year (this year, past years, both together) for the school, a class or a section. */
export const GET = api("staff", ({ req, viewer }) => {
  const q = readQuery(req, Query);
  return feePosition(viewer, q.session, q.class ?? null, q.section);
});
