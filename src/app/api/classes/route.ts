import { api, readBody } from "@/server/http";
import { ClassBody } from "@/server/schemas/setup";
import { classes } from "@/server/services/context";
import { addClass } from "@/server/services/setup";

/** All classes in teaching order. */
export const GET = api("staff", ({ viewer }) => classes(viewer));

export const POST = api("writer", async ({ req, viewer }) => addClass(viewer, await readBody(req, ClassBody)));
