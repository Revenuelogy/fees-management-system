// Sends one chunk of a parsed CSV to the import API (POST /api/imports/[kind]).

import { ApiError, api, errorMessage, refreshAll } from "@/lib/api/client";
import type { ActionState } from "@/lib/action-state";
import type { ImportKind, ImportSummary } from "@/lib/import-columns";

/**
 * Imports one chunk (at most 1000 rows). `offset` is the index of the chunk's first row in the file, so
 * error line numbers match the spreadsheet (line 1 = header). `data` is the chunk's ImportSummary.
 */
export async function importChunk(input: {
  kind: ImportKind;
  rows: Record<string, string>[];
  offset: number;
  final: boolean;
  sessionId?: string | null;
  generate?: boolean;
}): Promise<ActionState> {
  try {
    const summary = await api.post<ImportSummary>(`/api/imports/${input.kind}`, {
      rows: input.rows,
      offset: input.offset,
      final: input.final,
      session_id: input.sessionId ?? null,
      generate: !!input.generate,
    });
    if (summary.sent || summary.generated) await refreshAll();
    return { ok: true, data: summary };
  } catch (e) {
    // a refused chunk still reports the row problems found before sending
    const summary = e instanceof ApiError ? (e.body as { summary?: ImportSummary } | undefined)?.summary : undefined;
    return { error: errorMessage(e), data: summary };
  }
}
