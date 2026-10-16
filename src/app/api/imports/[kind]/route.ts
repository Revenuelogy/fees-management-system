import { z } from "zod";
import { api, pathParam, readBody } from "@/server/http";
import { MAX_ROWS, importChunk } from "@/server/services/imports";
import { IMPORT_KINDS } from "@/lib/import-columns";
import { id } from "@/server/validate";

const Body = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).max(MAX_ROWS, `Send at most ${MAX_ROWS} rows at a time.`),
  offset: z.number().int().min(0).default(0),
  final: z.boolean().default(true),
  session_id: id("Unknown session.").nullable().default(null),
  generate: z.boolean().default(false),
});

/** Import one chunk of a CSV: students, opening dues or historical payments. */
export const POST = api<{ kind: string }>("writer", async ({ req, params, viewer }) => {
  const kind = pathParam(z.enum(IMPORT_KINDS as [string, ...string[]]), params.kind) as (typeof IMPORT_KINDS)[number];
  return importChunk(viewer, kind, await readBody(req, Body));
});
