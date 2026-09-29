import { beforeEach, describe, expect, it, vi } from "vitest";

// The audit writer + hash chain + verifier, against an in-memory AuditLog.

type Row = Record<string, unknown> & { id: string; createdAt: Date; hash: string | null; prevHash: string | null; action: string };
const rows: Row[] = [];
let redisHead: string | null = null;

const table = {
  findFirst: vi.fn(async () => {
    const hashed = rows.filter((r) => r.hash).sort((a, b) => +b.createdAt - +a.createdAt);
    return hashed[0] ?? null;
  }),
  create: vi.fn(async ({ data }: { data: Row }) => {
    rows.push({ ...data });
    return data;
  }),
  findMany: vi.fn(async ({ where, cursor }: { where?: { hash?: unknown }; cursor?: unknown }) => {
    if (cursor) return [];
    const list = where?.hash ? rows.filter((r) => r.hash) : rows;
    return [...list].sort((a, b) => +a.createdAt - +b.createdAt);
  }),
  count: vi.fn(async ({ where }: { where?: { hash: null } } = {}) => (where ? rows.filter((r) => !r.hash).length : rows.length)),
};
const lock = vi.fn(async () => []);
vi.mock("@/lib/prisma", () => {
  const p = { auditLog: table, $queryRaw: lock } as Record<string, unknown>;
  p.$transaction = async (fn: (tx: unknown) => unknown) => fn(p);
  return { prisma: p };
});
vi.mock("@/lib/redis", () => ({
  redis: {
    set: vi.fn(async (_k: string, v: string) => { redisHead = v; }),
    get: vi.fn(async () => redisHead),
    setNx: vi.fn(async () => true),
  },
}));
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret-test-secret-test-secret" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ getClientIp: () => "unknown" }));

const { auditAdminAction, auditEvent } = await import("./audit");
const { verifyAuditChain } = await import("./audit-verify");
const { runWithAdminContext } = await import("./request-context");

beforeEach(() => {
  rows.length = 0;
  redisHead = null;
  vi.clearAllMocks();
});

async function writeThree() {
  await auditAdminAction("admin1", "coupon.updated", "c1", { before: { discountValue: 10 }, after: { discountValue: 20 } });
  await auditAdminAction("admin1", "user.suspended", "u1", { reason: "spam" });
  await auditEvent({ actorId: "u2", actorType: "user", action: "social.connect", targetId: "s1" });
}

describe("audit writer", () => {
  it("stores reason, actor type and who/where as columns, chained to the previous row", async () => {
    await writeThree();
    expect(rows).toHaveLength(3);
    expect(rows[0].prevHash).toBe("GENESIS");
    expect(rows[1].prevHash).toBe(rows[0].hash);
    expect(rows[2].prevHash).toBe(rows[1].hash);
    expect(rows[1]).toMatchObject({ reason: "spam", actorType: "admin" });
    expect(rows[2]).toMatchObject({ actorType: "user", adminId: "u2" });
    expect(lock).toHaveBeenCalledTimes(3);
    expect(redisHead).toBe(rows[2].hash);
  });

  it("fills IP, device and session from the admin request context", async () => {
    await runWithAdminContext(
      { adminId: "admin1", adminEmail: "a@x.co", sessionId: "sess-9", ip: "10.0.0.7", userAgent: "Mozilla/5.0 Chrome" },
      () => auditAdminAction("admin1", "plan.updated", "p1"),
    );
    expect(rows[0]).toMatchObject({ ip: "10.0.0.7", userAgent: "Mozilla/5.0 Chrome", sessionId: "sess-9" });
  });

  it("never takes another actor's context", async () => {
    await runWithAdminContext(
      { adminId: "admin1", adminEmail: "a@x.co", sessionId: "sess-9", ip: "10.0.0.7", userAgent: "UA" },
      () => auditEvent({ actorId: "someone-else", actorType: "user", action: "social.refresh" }),
    );
    expect(rows[0]).toMatchObject({ ip: null, sessionId: null });
  });

  it("never throws when the database write fails", async () => {
    table.create.mockRejectedValueOnce(new Error("db down"));
    await expect(auditAdminAction("admin1", "tool.updated", "t")).resolves.toBeUndefined();
  });
});

describe("verifyAuditChain", () => {
  it("passes an untouched chain", async () => {
    await writeThree();
    const r = await verifyAuditChain();
    expect(r).toMatchObject({ ok: true, verifiedRows: 3, tampered: [], broken: [], headMissing: false });
  });

  it("flags the exact row whose content was edited", async () => {
    await writeThree();
    rows[1].reason = "edited later";
    const r = await verifyAuditChain();
    expect(r.ok).toBe(false);
    expect(r.tampered.map((t) => t.id)).toEqual([rows[1].id]);
  });

  it("flags a deleted row in the middle (the next row's link is broken)", async () => {
    await writeThree();
    const [deleted] = rows.splice(1, 1);
    const r = await verifyAuditChain();
    expect(r.ok).toBe(false);
    expect(r.broken.map((b) => b.id)).toEqual([rows[1].id]);
    expect(deleted).toBeTruthy();
  });

  it("flags deleting the newest rows (no link breaks, but the recorded head is gone)", async () => {
    await writeThree();
    rows.pop();
    const r = await verifyAuditChain();
    expect(r).toMatchObject({ ok: false, headMissing: true });
  });

  it("counts rows from before hashing as legacy, not as tampered", async () => {
    rows.push({ id: "old", createdAt: new Date("2026-01-01"), hash: null, prevHash: null, action: "user.deleted" });
    await writeThree();
    const r = await verifyAuditChain();
    expect(r).toMatchObject({ ok: true, legacyRows: 1, verifiedRows: 3 });
  });
});
