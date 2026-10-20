import { api } from "@/server/http";

/** The signed-in login, with or without a role (the waiting-for-access page uses it too). */
export const GET = api("signed-in", async ({ viewer }) => viewer);
