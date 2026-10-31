import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { setRole } from "@/server/services/admin";
import { id } from "@/server/validate";

const Body = z.object({ role: z.enum(["admin", "accountant", "principal", "caller", "teacher"], { error: "Choose a role." }).nullable() });

/** Change a staff member's role (null = no access). Admin only. */
export const PATCH = api<{ id: string }>("admin", async ({ req, params, viewer }) =>
  setRole(viewer, pathParam(id(), params.id), (await readBody(req, Body)).role),
);
