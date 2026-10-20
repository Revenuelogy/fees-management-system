import "server-only";

// Failed sign-ins per key (client address, email) in a sliding window. In-process, like the cache:
// with several app instances each counts on its own, which still slows guessing down a lot.

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures: Map<string, number[]> = ((globalThis as unknown as { __feesLoginFailures?: Map<string, number[]> }).__feesLoginFailures ??=
  new Map());

function recent(key: string, now: number) {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

/** Seconds until another attempt is allowed, or 0. */
export function retryAfter(keys: string[]): number {
  const now = Date.now();
  let wait = 0;
  for (const key of keys) {
    const list = recent(key, now);
    if (list.length >= MAX_FAILURES) wait = Math.max(wait, Math.ceil((list[0] + WINDOW_MS - now) / 1000));
  }
  return wait;
}

export function recordFailure(keys: string[]) {
  const now = Date.now();
  for (const key of keys) failures.set(key, [...recent(key, now), now]);
  if (failures.size > 10_000) failures.clear(); // bound memory under a flood of distinct keys
}

export function clearFailures(keys: string[]) {
  for (const key of keys) failures.delete(key);
}
