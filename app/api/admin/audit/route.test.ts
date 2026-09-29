import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api-handler")>("@/lib/api-handler");
  return {
    parseQuery: real.parseQuery,
    withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string } }) => Promise<Response>) =>
      async (req: NextRequest) => {
        try {
          return await handler(req, { admin: { userId: "admin-1" } });
        } catch (e) {
          return real.mapHandlerError("test", req, e);
        }
      },
  };
});
vi.mock("@/lib/env", () => ({ env: { JWT_SECRET: "test-secret-test-secret-test-secret" } }));

let findManyArgs: { where: unknown } | undefined;
const rows: Array<Record<string, unknown>> = [];
const users = [
  { id: "admin-1", email: "boss@clipiro.test" },
  { id: "u1", email: "pat@example.com" },
];
vi.mock("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(async (args: { where: unknown }) => {
        findManyArgs = args;
        return rows;
      }),
      count: vi.fn(async () => rows.length),
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; email?: { contains: string } } }) =>
        where.id ? users.filter((u) => where.id!.in.includes(u.id)) : users.filter((u) => u.email.includes(where.email!.contains)),
      ),
    },
    coupon: { findMany: vi.fn(async () => [{ id: "c1", code: "SAVE20" }]) },
    affiliate: { findMany: vi.fn(async () => [{ id: "aff-1", code: "PAT-1" }]) },
  },
}));

const { GET } = await import("./route");
const get = (q = "") => GET(new NextRequest(`http://localhost/api/admin/audit${q}`));

const legacyRow = (over: Record<string, unknown>) => ({
  id: "r1", adminId: "admin-1", action: "user.suspended", targetId: "u1", before: null, after: null,
  createdAt: new Date("2026-09-29T10:00:00Z"), actorType: null, reason: null, ip: null, userAgent: null, sessionId: null,
  hash: null, prevHash: null, ...over,
});

beforeEach(() => {
  rows.length = 0;
  findManyArgs = undefined;
  vi.clearAllMocks();
});

describe("GET /api/admin/audit", () => {
  it("returns readable events: sentence parts, resolved target, severity, and reason/IP pulled out of legacy _meta", async () => {
    rows.push(legacyRow({ after: JSON.stringify({ suspendedAt: "2026-09-29T10:00:00Z", _meta: { reason: "spam", ip: "1.2.3.4" } }) }));
    const body = await (await get()).json();
    const e = body.events[0];
    expect(e).toMatchObject({
      label: "Suspended account",
      category: "accounts",
      severity: "destructive",
      reason: "spam",
      ip: "1.2.3.4",
      missingReason: false,
      integrity: "legacy",
      actor: { email: "boss@clipiro.test", type: "admin" },
      target: { label: "pat@example.com", href: "/admin/users/u1", type: "user" },
    });
    expect(e.after).toEqual({ suspendedAt: "2026-09-29T10:00:00Z" });
  });

  it("flags a destructive action recorded without a reason", async () => {
    rows.push(legacyRow({}));
    expect((await (await get()).json()).events[0].missingReason).toBe(true);
  });

  it("names a coupon by its code, and a user-initiated legacy row as a user action", async () => {
    rows.push(legacyRow({ id: "r2", action: "coupon.updated", targetId: "c1" }));
    rows.push(legacyRow({ id: "r3", action: "affiliate.payout_requested", targetId: "aff-1", adminId: "u1" }));
    const [coupon, payout] = (await (await get()).json()).events;
    expect(coupon.target.label).toBe("SAVE20");
    expect(payout.actor).toMatchObject({ type: "user", email: "pat@example.com" });
  });

  it("translates category, severity and search filters into the query", async () => {
    await get("?category=billing&severity=money&q=SAVE20&missingReason=1");
    const where = JSON.stringify(findManyArgs!.where);
    expect(where).toContain("credits.granted");
    expect(where).toContain("SAVE20");
    expect(where).toContain('"reason":null');
  });

  it("returns nothing (without querying the log) for an admin email that matches no one", async () => {
    const body = await (await get("?adminEmail=nobody@none")).json();
    expect(body).toEqual({ events: [], total: 0, nextCursor: null });
    expect(findManyArgs).toBeUndefined();
  });

  it("uses an ISO `to` as given, and a bare date as the end of that day", async () => {
    await get("?to=2026-09-30T18:29:59.999Z");
    expect(JSON.stringify(findManyArgs!.where)).toContain("2026-09-30T18:29:59.999Z");
    await get("?to=2026-09-30");
    expect(JSON.stringify(findManyArgs!.where)).toContain("2026-09-30T23:59:59.999Z");
  });

  it("paginates by cursor", async () => {
    for (let i = 0; i < 3; i++) rows.push(legacyRow({ id: `r${i}` }));
    const body = await (await get("?limit=2")).json();
    expect(body.events).toHaveLength(2);
    expect(body.nextCursor).toBe("r1");
  });
});
