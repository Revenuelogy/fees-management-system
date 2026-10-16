import { z } from "zod";
import { api, readBody } from "@/server/http";
import { copyStructure } from "@/server/services/setup";
import { id } from "@/server/validate";

const Body = z.object({ session_id: id("Choose a session."), class_id: id("Choose a class."), from_class: id("Choose the class to copy from.") });

/** Replace a class's amounts with another class's (same session). Returns the new amounts. */
export const POST = api("writer", async ({ req, viewer }) => {
  const b = await readBody(req, Body);
  return copyStructure(viewer, b.session_id, b.class_id, b.from_class);
});
