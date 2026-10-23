// A few seconds of in-process memory for public, unauthenticated reads that
// hit the database on every request (plans, tool costs, active coupons, the
// health probe). Short enough that an admin edit shows up almost at once,
// long enough that a flood of requests costs one query per window instead of
// one per request. Concurrent callers share the in-flight promise; a failure
// is not cached.

export function memoFor<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  // Route tests call the same handler repeatedly with different fixtures.
  if (process.env.NODE_ENV === "test") return load;
  let cached: { value: Promise<T>; expiresAt: number } | null = null;
  return () => {
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.value;
    const value = load();
    cached = { value, expiresAt: now + ttlMs };
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
    return value;
  };
}
