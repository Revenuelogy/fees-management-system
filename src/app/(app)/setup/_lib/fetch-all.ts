// Server-side query helpers for the setup pages.

type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * The Data API returns at most 1000 rows per request. Pages through a query until it is exhausted.
 * The query must have a stable order (e.g. `.order("id")`).
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

/** `[{count: n}]` (PostgREST embedded count) -> n */
export function embeddedCount(v: unknown): number {
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] && "count" in v[0]) {
    return Number((v[0] as { count: number }).count) || 0;
  }
  return 0;
}
