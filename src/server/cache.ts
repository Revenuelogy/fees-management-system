import "server-only";

/**
 * Small in-process cache for database reads.
 *
 * - Every entry lives for CACHE_TTL_SECONDS (default 30 s), so changes made outside this server
 *   (another instance, a manual SQL fix) show up within that time.
 * - Writes made through the API call invalidate() with the entry's tags, so the next read is fresh
 *   immediately.
 * - Concurrent requests for the same key share one database query.
 * - A read that started before an invalidation is returned to its caller but never stored, so it
 *   cannot put stale data back into the cache.
 *
 * Cached values are shared between requests: treat them as read-only.
 * CACHE_TTL_SECONDS=0 turns caching off.
 */

export const TAGS = {
  /**
   * All school data: students, fees, payments, setup, settings. A payment or fee change moves figures on
   * nearly every screen, so every data write drops every data read; writes are rare next to reads.
   */
  data: "data",
  /** Logins, roles and sign-in sessions. */
  staff: "staff",
} as const;

type Entry = { value: unknown; expires: number; tags: readonly string[] };
type Flight = { promise: Promise<unknown>; tags: readonly string[] };

const MAX_ENTRIES = 500;

type CacheState = { entries: Map<string, Entry>; flights: Map<string, Flight> };

const state = ((globalThis as unknown as { __feesCache?: CacheState }).__feesCache ??= {
  entries: new Map(),
  flights: new Map(),
});

export function ttlSeconds(): number {
  const raw = process.env.CACHE_TTL_SECONDS;
  const n = raw === undefined || raw === "" ? 30 : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Drop expired entries, then the least recently used ones above MAX_ENTRIES. */
function evict() {
  const now = Date.now();
  for (const [key, e] of state.entries) if (e.expires <= now) state.entries.delete(key);
  // Map keeps insertion (= least recently used) order
  for (const key of state.entries.keys()) {
    if (state.entries.size <= MAX_ENTRIES) break;
    state.entries.delete(key);
  }
}

/** Return the cached value for `key`, or load it (once, even under concurrent requests) and cache it. */
export async function cached<T>(key: string, tags: readonly string[], load: () => Promise<T>, ttl = ttlSeconds()): Promise<T> {
  if (ttl <= 0) return load();

  const hit = state.entries.get(key);
  if (hit && hit.expires > Date.now()) {
    state.entries.delete(key);
    state.entries.set(key, hit);
    return hit.value as T;
  }

  const flight = state.flights.get(key);
  if (flight) return flight.promise as Promise<T>;

  const promise: Promise<T> = load().then(
    (value) => {
      // invalidate()/forget() remove the flight; then this result may already be stale
      if (state.flights.get(key)?.promise === promise) {
        state.flights.delete(key);
        state.entries.delete(key);
        state.entries.set(key, { value, expires: Date.now() + ttl * 1000, tags });
        evict();
      }
      return value;
    },
    (error) => {
      if (state.flights.get(key)?.promise === promise) state.flights.delete(key);
      throw error;
    },
  );
  state.flights.set(key, { promise, tags });
  return promise;
}

/** Drop every entry (and in-flight read) carrying any of these tags. */
export function invalidate(...tags: string[]) {
  const hit = (entryTags: readonly string[]) => entryTags.some((t) => tags.includes(t));
  for (const [key, e] of state.entries) if (hit(e.tags)) state.entries.delete(key);
  for (const [key, f] of state.flights) if (hit(f.tags)) state.flights.delete(key);
}

/** Drop one key (and its in-flight read). */
export function forget(key: string) {
  state.entries.delete(key);
  state.flights.delete(key);
}

/** Stable cache key from a name and its arguments. */
export function cacheKey(name: string, ...parts: unknown[]): string {
  return `${name}:${JSON.stringify(parts)}`;
}
