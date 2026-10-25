import { z } from "zod";
import { api, readQuery } from "@/server/http";
import { searchFamilies } from "@/server/services/recovery";

const Query = z.object({ q: z.string().trim().max(100).default("") });

/** Find a family by a parent's name or phone, or a child's name, admission number, parents' names or phone. */
export const GET = api("caller", ({ req, viewer }) => searchFamilies(viewer, readQuery(req, Query).q));
