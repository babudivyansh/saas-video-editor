import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Opening an account's admin page is a read of personal data: audited as
// user.viewed — once per admin per account per 30 minutes, not per refetch.

vi.mock("@/lib/admin/api", () => ({
  withAdmin: (handler: (req: NextRequest, ctx: { admin: { userId: string }; params: unknown }) => Promise<Response>) =>
    async (req: NextRequest, ctx: { params: Promise<unknown> }) => handler(req, { admin: { userId: "admin-1" }, params: await ctx.params }),
  parseBody: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ id: "u1", email: "pat@example.com", razorpaySubscriptionId: null })) },
    purchase: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    generation: { findMany: vi.fn(async () => []), aggregate: vi.fn(async () => ({ _sum: { creditsCost: 0 }, _count: 0 })) },
    socialAccount: { findMany: vi.fn(async () => []) },
    affiliate: { findUnique: vi.fn(async () => null) },
    loginEvent: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ listSessions: vi.fn(async () => []) }));
const audit = vi.fn();
const seen = new Set<string>();
vi.mock("@/lib/admin/audit", () => ({
  auditAdminAction: (...a: unknown[]) => audit(...a),
  auditIp: () => "127.0.0.1",
  auditOnce: async (key: string) => (seen.has(key) ? false : (seen.add(key), true)),
}));

const { GET } = await import("./route");
const open = (id: string) => GET(new NextRequest(`http://x/api/admin/users/${id}/detail`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  audit.mockClear();
  seen.clear();
});

describe("GET /api/admin/users/[id]/detail — view auditing", () => {
  it("records user.viewed the first time, and not again on a refetch", async () => {
    expect((await open("u1")).status).toBe(200);
    await open("u1");
    await open("u1");
    expect(audit.mock.calls.filter((c) => c[1] === "user.viewed")).toEqual([["admin-1", "user.viewed", "u1"]]);
  });

  it("records a view of a different account separately", async () => {
    await open("u1");
    await open("u2");
    expect(audit.mock.calls.map((c) => c[2])).toEqual(["u1", "u2"]);
  });

  it("never shows the Razorpay subscription id, only whether one exists", async () => {
    const body = await (await open("u1")).json();
    expect(body.user).not.toHaveProperty("razorpaySubscriptionId");
    expect(body.user.hasRecurringSubscription).toBe(false);
  });
});
