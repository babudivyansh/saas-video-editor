// Test-only: makes a hand-rolled `prisma` mock able to run the audit writer
// (lib/admin/audit.ts), which appends inside an interactive transaction with
// an advisory lock and a read of the previous hash. Route tests that assert
// on `auditLog.create` wrap their mock in this instead of each re-deriving
// what the writer needs. Not imported by any runtime code.

type AnyMock = Record<string, unknown> & { auditLog?: Record<string, unknown> };

export function withAuditTx<T extends AnyMock>(mock: T): T {
  const m = mock as AnyMock;
  const auditLog = { findFirst: async () => null, ...(m.auditLog ?? {}) };
  m.auditLog = auditLog;
  if (typeof m.$queryRaw !== "function") m.$queryRaw = async () => [];
  const original = m.$transaction as ((arg: unknown) => unknown) | undefined;
  // Interactive form (a callback) runs against the mock itself; the array
  // form keeps whatever the test already did with it.
  m.$transaction = async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(m) : original ? original(arg) : Promise.all(arg as unknown[]);
  return mock;
}
