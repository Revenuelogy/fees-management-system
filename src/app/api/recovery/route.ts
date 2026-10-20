import { api } from "@/server/http";
import { overview } from "@/server/services/recovery";

/** Every campaign and activity with its results, families to call now and promises falling due. */
export const GET = api("staff", ({ viewer }) => overview(viewer));
