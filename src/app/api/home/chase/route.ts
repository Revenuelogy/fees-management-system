import { api } from "@/server/http";
import { chase } from "@/server/services/home";

/** Home: the first five families of today's call list. */
export const GET = api("staff", ({ viewer }) => chase(viewer));
