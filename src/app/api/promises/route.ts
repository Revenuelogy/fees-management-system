import { api } from "@/server/http";
import { openPromises } from "@/server/services/recovery";

/** Every family's open promise to pay, soonest date first. */
export const GET = api("caller", ({ viewer }) => openPromises(viewer));
