import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { classes } from "@/server/services/home";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Home: each class's share of its total fees this year received, and what is due till today. */
export const GET = api("staff", ({ req, viewer }) => classes(viewer, readQuery(req, Query).session));
