type Page = PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * The Supabase Data API returns at most 1000 rows per request (config `max_rows`).
 * Pages through a query until it is exhausted. Build a fresh query per call and give it a stable order.
 */
export async function fetchAll<T>(page: (from: number, to: number) => Page, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = (data as T[] | null) ?? [];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
