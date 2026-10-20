import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { checklist } from "@/server/services/setup";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Unknown session.").optional() });

/** What the setup checklist needs: fee heads, installments, fee structure coverage, enrolment, fee plans. */
export const GET = api("writer", ({ req, viewer }) => checklist(viewer, readQuery(req, Query).session ?? null));
