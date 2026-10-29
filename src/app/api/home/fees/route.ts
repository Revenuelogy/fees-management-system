import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { fees } from "@/server/services/home";
import { id } from "@/server/validate";

const Query = z.object({ session: id("Choose a session.") });

/** Home: this year's fees, previous years' dues, the total due, and the school (students, families, classes, by status). */
export const GET = api("staff", ({ req, viewer }) => fees(viewer, readQuery(req, Query).session));
