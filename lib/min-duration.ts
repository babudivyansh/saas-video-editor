/**
 * Waits until at least `ms` have passed since `startedAt`.
 *
 * For routes that must answer "no such account" and "code sent" alike:
 * without a floor the no-account branch returns before any email is sent and
 * is measurably faster, which leaks which addresses are registered.
 */
export async function atLeast(startedAt: number, ms: number): Promise<void> {
  const remaining = ms - (Date.now() - startedAt);
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
}
