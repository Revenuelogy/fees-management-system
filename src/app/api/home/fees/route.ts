import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { fees } from "@/server/services/home";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Home: this year's fees (Total fee, Received, Due now, Due later, Old balance) and what is left to recover. */
export const GET = api("staff", ({ req, viewer }) => fees(viewer, readQuery(req, Query).session));
