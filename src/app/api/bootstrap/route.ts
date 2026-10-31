import { api } from "@/server/http";
import { bootstrap } from "@/server/services/context";

/** Signed-in staff member, sessions, classes and school settings for the app shell. */
export const GET = api("caller", ({ viewer }) => bootstrap(viewer));
