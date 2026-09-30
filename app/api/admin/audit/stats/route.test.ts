import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseQuery: real.parseQuery,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string } }) => Promise<Response>) =>
      (req: NextRequest) => handler(req, { admin: { userId: "admin-1" } }),
  };
});
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret-test-secret-test-secret", DATABASE_URL: "postgres://t" } }));

const rows: Array<{ action: string; createdAt: Date; adminId: string; actorType: string | null; reason: string | null; after: string | null }> = [];
let findManyArgs: { where: unknown } | undefined;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: { findMany: vi.fn(async (a: { where: unknown }) => { findManyArgs = a; return rows; }) },
    user: { findMany: vi.fn(async () => [{ id: "admin-1", email: "boss@clipiro.test" }, { id: "u9", email: "pat@example.com" }]) },
  },
}));

const { GET } = await import("./route");
const get = (q = "") => GET(new NextRequest(`http://localhost/api/admin/audit/stats${q}`));
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  rows.length = 0;
  findManyArgs = undefined;
});

describe("GET /api/admin/audit/stats", () => {
  it("counts by severity and category, top actions and actors, and destructive actions missing a reason", async () => {
    rows.push(
      { action: "user.hard_delete", createdAt: at("2026-09-29T20:00:00Z"), adminId: "admin-1", actorType: "admin", reason: null, after: null },
      { action: "user.hard_delete", createdAt: at("2026-09-29T21:00:00Z"), adminId: "admin-1", actorType: "admin", reason: "GDPR request", after: null },
      { action: "credits.granted", createdAt: at("2026-09-30T05:00:00Z"), adminId: "admin-1", actorType: "admin", reason: null, after: '{"credits":5,"_meta":{"reason":"goodwill"}}' },
      { action: "affiliate.payout_requested", createdAt: at("2026-09-30T06:00:00Z"), adminId: "u9", actorType: null, reason: null, after: null },
    );
    const s = await (await get()).json();
    expect(s.total).toBe(4);
    expect(s.bySeverity).toMatchObject({ critical: 2, money: 2 });
    expect(s.byCategory).toMatchObject({ accounts: 2, billing: 1, affiliates: 1 });
    // Only the reasonless hard delete counts; the legacy _meta reason is honoured.
    expect(s.missingReason).toBe(1);
    expect(s.topActions[0]).toEqual({ action: "user.hard_delete", label: "Deleted account", count: 2 });
    expect(s.topActors).toEqual([
      expect.objectContaining({ email: "boss@clipiro.test", type: "admin", count: 3 }),
      expect.objectContaining({ email: "pat@example.com", type: "user", count: 1 }),
    ]);
  });

  it("buckets days in the viewer's timezone", async () => {
    // 20:00 UTC on the 29th is already the 30th in India.
    rows.push({ action: "plan.updated", createdAt: at("2026-09-29T20:00:00Z"), adminId: "admin-1", actorType: "admin", reason: null, after: null });
    const ist = await (await get("?tz=Asia/Kolkata")).json();
    const utc = await (await get("?tz=UTC")).json();
    expect(ist.days.map((d: { day: string }) => d.day)).toEqual(["2026-09-30"]);
    expect(utc.days.map((d: { day: string }) => d.day)).toEqual(["2026-09-29"]);
  });

  it("defaults to the last 30 days and shares the list's filters", async () => {
    await get("?category=billing");
    const where = JSON.stringify(findManyArgs!.where);
    expect(where).toContain("credits.granted");
    expect(where).toContain('"gte"');
  });

  it("ignores an invalid timezone instead of failing", async () => {
    expect((await get("?tz=Not/AZone")).status).toBe(200);
  });
});
