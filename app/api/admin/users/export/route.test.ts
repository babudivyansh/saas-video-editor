import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let isAdmin = true;
vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(async () => (isAdmin ? { userId: "admin-1", email: "admin@test.co", sessionId: "s1" } : null)),
}));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (key: string) => (key.startsWith("admin-elevated:") ? "1" : null)),
    set: vi.fn(async () => {}),
    del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));
let allowed = true;
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed })), getClientIp: () => "1.2.3.4" }));
const auditAdminAction = vi.fn(async () => {});
vi.mock("@/lib/admin/audit", () => ({ auditAdminAction, auditIp: () => null, auditOnce: vi.fn(async () => false) }));
const findMany = vi.fn(async () => [
  {
    id: "u1", email: "priya@x.co", name: "=HYPERLINK(\"evil\")", createdAt: new Date("2026-11-10T10:00:00Z"), hasPassword: false,
    intendedUse: "gaming", signupReferrer: "instagram.com", signupLandingPath: "/gta-6-clip-maker", signupSource: null,
    subscriptionEndsAt: null, lastLoginAt: null, role: "USER", suspendedAt: null,
    plan: null, _count: { projects: 2 },
  },
]);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany },
    purchase: { groupBy: vi.fn(async () => [{ userId: "u1", _sum: { amountInPaise: 79900 }, _count: { _all: 1 } }]) },
  },
}));

const { GET } = await import("./route");
const get = (qs = "") => GET(new NextRequest(`http://localhost/api/admin/users/export${qs}`));

beforeEach(() => {
  isAdmin = true;
  allowed = true;
  vi.clearAllMocks();
});

describe("/api/admin/users/export", () => {
  it("is admin-only", async () => {
    isAdmin = false;
    expect((await get()).status).toBe(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("exports the filtered list as CSV and audits it", async () => {
    const res = await get("?journey=ran&joined=30d");
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="clipiro-users-\d{4}-\d{2}-\d{2}\.csv"/);
    const [header, row] = (await res.text()).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(header.split(",")).toContain("autoclip_runs");
    // Formula injection is neutralised.
    expect(row).toBe(`u1,priya@x.co,"'=HYPERLINK(""evil"")",2026-11-10T10:00:00.000Z,google,gaming,instagram.com,/gta-6-clip-maker,,Starter,,,USER,no,2,799.00,1`);
    expect(auditAdminAction).toHaveBeenCalledWith("admin-1", "users.exported", undefined, expect.objectContaining({
      after: { rows: 1, truncated: false, filters: { journey: "ran", joined: "30d" } },
    }));
  });

  it("is rate-limited", async () => {
    allowed = false;
    expect((await get()).status).toBe(429);
    expect(findMany).not.toHaveBeenCalled();
  });
});
