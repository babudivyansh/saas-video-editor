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
  user: { groupBy: vi.fn(async () => [] as unknown[]), count: vi.fn(async () => 0), findMany: vi.fn(async () => [] as unknown[]) },
  plan: { findMany: vi.fn(async () => [] as unknown[]) },
  purchase: {
    aggregate: vi.fn(async () => ({ _sum: { amountInPaise: 0 } })),
    count: vi.fn(async () => 0),
    groupBy: vi.fn(async () => []),
    findMany: vi.fn(async () => [] as unknown[]),
  },
  generation: {
    aggregate: vi.fn(async () => ({ _sum: {} })),
    groupBy: vi.fn(async () => []),
    findMany: vi.fn(async () => [] as unknown[]),
  },
  commission: { groupBy: vi.fn(async () => []) },
  couponRedemption: { aggregate: vi.fn(async () => ({ _sum: { discountInPaise: 0 } })), findMany: vi.fn(async () => [] as unknown[]) },
  auditLog: { findMany: vi.fn(async () => [] as unknown[]) },
  socialAccount: { groupBy: vi.fn(async () => []), aggregate: vi.fn(async () => ({ _sum: {} })), count: vi.fn(async () => 0) },
  socialPost: { count: vi.fn(async () => 0) },
  $queryRaw: vi.fn(async () => [{ count: 0n }]),
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { kpisSection, revenueSection, activitySection, infraSection } = await import("./metrics");
const { redis } = await import("@/lib/redis");
const { KNOWN_CRON_NAMES } = await import("@/lib/cron-tracking");

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

describe("revenueSection sources + AOV", () => {
  it("builds the sources donut from real slices and computes AOV from the series", async () => {
    // Promise.all order: daily series ($queryRaw#1), signup series (#2), then
    // groupBys/aggregates; byKind is $queryRaw#3.
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { day: new Date("2026-07-10"), revenue: 100_000n, refunds: 10_000n, purchases: 2n },
        { day: new Date("2026-07-11"), revenue: 50_000n, refunds: 0n, purchases: 1n },
      ] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        { kind: "subscription", revenue: 120_000n, purchases: 2n },
        { kind: "pack", revenue: 30_000n, purchases: 1n },
      ] as never);
    prismaMock.commission.groupBy.mockResolvedValueOnce([
      { status: "paid", _sum: { amount: 500 }, _count: 2 },
    ] as never);
    prismaMock.couponRedemption.aggregate.mockResolvedValueOnce({ _sum: { discountInPaise: 20_000 } } as never);

    const r = await revenueSection(30);
    // refunded amounts excluded from revenue; AOV = 150,000 / 3 purchases
    expect(r.aovInPaise).toBe(50_000);
    expect(r.series[0].refundsInPaise).toBe(10_000);
    const byName = Object.fromEntries(r.sources.map((s) => [s.name, s]));
    expect(byName["Subscriptions"].inPaise).toBe(120_000);
    expect(byName["Credit packs"].inPaise).toBe(30_000);
    expect(byName["Affiliate payouts"]).toMatchObject({ inPaise: 50_000, isCost: true }); // ₹500 → paise
    expect(byName["Coupon discounts"]).toMatchObject({ inPaise: 20_000, isCost: true });
    expect(r.sources.some((s) => s.name.toLowerCase().includes("enterprise"))).toBe(false); // never faked
    expect(r.previousSeries).toBeNull(); // compare not requested
  });
});

describe("activitySection", () => {
  it("merges sources newest-first and links events", async () => {
    const t = (min: number) => new Date(Date.now() - min * 60_000);
    prismaMock.user.findMany.mockResolvedValueOnce([
      { id: "u1", email: "new@t.co", name: null, createdAt: t(5) },
    ] as never);
    prismaMock.purchase.findMany.mockResolvedValueOnce([
      { id: "p1", amountInPaise: 99_900, status: "captured", createdAt: t(1), user: { id: "u2", email: "buyer@t.co" }, plan: { name: "Pro" } },
      { id: "p2", amountInPaise: 49_900, status: "refunded", createdAt: t(10), user: { id: "u3", email: "ref@t.co" }, plan: { name: "Pack" } },
    ] as never);
    prismaMock.generation.findMany.mockResolvedValueOnce([
      { id: "g1", toolSlug: "image-generator", modelId: "flux-2", createdAt: t(3), userId: "u4" },
    ] as never);
    prismaMock.auditLog.findMany.mockResolvedValueOnce([] as never);
    prismaMock.couponRedemption.findMany.mockResolvedValueOnce([] as never);

    const a = await activitySection();
    expect(a.events.map((e) => e.kind)).toEqual(["purchase", "generation_failed", "user", "refund"]);
    expect(a.events[0].title).toContain("buyer@t.co");
    expect(a.events[0].title).toContain("₹999");
    expect(a.events[2].href).toBe("/admin/users/u1");
    expect(a.events[3].kind).toBe("refund");
  });
});

describe("infraSection — stale cron detection", () => {
  // A production audit found every one of the 13 cron jobs had gone 14+ days
  // with no recorded run, silently blocking most of the app's scheduled
  // emails, and it was only discoverable by drilling into the Ops page's own
  // cron list. staleCronCount is what surfaces that as a Dashboard alert.
  //
  // infraSection also calls renderQueueCounts(), which opens a real BullMQ
  // connection unless redis.ping() reports down first — the file-level mock
  // has ping() succeed (for tests that don't reach this code at all), so
  // these tests force it to fail here to stay hermetic instead of actually
  // dialing a non-existent Redis.
  beforeEach(() => {
    vi.mocked(redis.ping).mockResolvedValue(false);
  });

  it("counts every cron as stale when none has ever run", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);
    const infra = await infraSection();
    expect(infra.staleCronCount).toBe(KNOWN_CRON_NAMES.length);
  });

  it("does not count a cron whose last run is within its expected cadence", async () => {
    vi.mocked(redis.get).mockImplementation(async () => new Date().toISOString());
    const infra = await infraSection();
    expect(infra.staleCronCount).toBe(0);
  });

  it("counts only the crons that are actually overdue for their own cadence", async () => {
    const now = Date.now();
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      // stale-clip-sweep expects ~15 min; give it a 2h-old run (overdue).
      if (key === "cron:lastrun:stale-clip-sweep") return new Date(now - 2 * 3600_000).toISOString();
      // refill-credits expects ~daily; give it a 2h-old run (well within cadence).
      if (key === "cron:lastrun:refill-credits") return new Date(now - 2 * 3600_000).toISOString();
      return null; // every other cron: never run
    });
    const infra = await infraSection();
    // Only stale-clip-sweep is overdue for ITS cadence; refill-credits is
    // fine at 2h old; every other cron is null (never run) and counts too.
    expect(infra.staleCronCount).toBe(KNOWN_CRON_NAMES.length - 1);
  });
});
