import { api } from "@/server/http";
import { today } from "@/server/services/home";

/** Home: received today and this month, families to call, promises due today, broken promises. */
export const GET = api("staff", ({ viewer }) => today(viewer));
