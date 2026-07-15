import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { JWT_SECRET: "test-secret", REDIS_URL: "redis://localhost:6379", NEXT_PUBLIC_APP_URL: "http://localhost:3000" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1), ping: vi.fn(async () => true) },
}));
vi.mock("@/lib/social/service", () => ({
  getSyncStats: vi.fn(async () => ({ ok: 5, fail: 1 })),
}));

// Only the queries kpisSection touches are mocked; counts default to 0.
const prismaMock = {
  user: { groupBy: vi.fn(async () => [] as unknown[]), count: vi.fn(async () => 0) },
  plan: { findMany: vi.fn(async () => [] as unknown[]) },
  purchase: {
    aggregate: vi.fn(async () => ({ _sum: { amountInPaise: 0 } })),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
  },
  generation: { aggregate: vi.fn(async () => ({ _sum: {} })), groupBy: vi.fn(async () => []) },
  commission: { groupBy: vi.fn(async () => []) },
  socialAccount: { groupBy: vi.fn(async () => []), aggregate: vi.fn(async () => ({ _sum: {} })), count: vi.fn(async () => 0) },
  socialPost: { count: vi.fn(async () => 0) },
  $queryRaw: vi.fn(async () => [{ count: 0n }]),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { kpisSection } = await import("./metrics");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockResolvedValue([{ count: 0n }]);
});

describe("kpisSection MRR", () => {
  it("normalizes multi-month plan prices to one month per subscriber", async () => {
    // 2 subscribers on a ₹2,997/3-month plan + 3 on a ₹999/1-month plan
    prismaMock.user.groupBy.mockResolvedValueOnce([
      { planId: "quarterly", _count: 2 },
      { planId: "monthly", _count: 3 },
    ]);
    prismaMock.plan.findMany.mockResolvedValueOnce([
      { id: "quarterly", priceInPaise: 299_700, intervalMonths: 3 },
      { id: "monthly", priceInPaise: 99_900, intervalMonths: 1 },
    ]);
    const k = await kpisSection(30);
    // 2 × 99,900 + 3 × 99,900 = 499,500 paise (₹4,995/mo)
    expect(k.mrrInPaise).toBe(499_500);
    expect(k.arrInPaise).toBe(499_500 * 12);
  });

  it("ignores subscribers whose planId no longer maps to a subscription plan", async () => {
    prismaMock.user.groupBy.mockResolvedValueOnce([{ planId: "deleted-plan", _count: 5 }]);
    prismaMock.plan.findMany.mockResolvedValueOnce([]);
    const k = await kpisSection(30);
    expect(k.mrrInPaise).toBe(0);
  });

  it("computes the churn proxy as expiries / (expiries + active)", async () => {
    // user.count call order in kpisSection: newUsers, dau, totalUsers, expired30d, activeSubs
    prismaMock.user.count
      .mockResolvedValueOnce(10) // newUsers
      .mockResolvedValueOnce(4) // dau
      .mockResolvedValueOnce(100) // totalUsers
      .mockResolvedValueOnce(5) // expired30d
      .mockResolvedValueOnce(45); // activeSubs
    const k = await kpisSection(30);
    expect(k.churnProxyPct).toBeCloseTo(10); // 5 / (5+45)
  });

  it("returns null (not zero) for growth/conversion when denominators are empty", async () => {
    const k = await kpisSection(30);
    expect(k.revenueGrowthPct).toBeNull();
    expect(k.conversionPct).toBeNull();
    expect(k.cac).toBeNull();
    expect(k.ltv).toBeNull();
  });
});
