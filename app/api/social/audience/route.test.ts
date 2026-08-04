import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let subscriber: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => subscriber),
}));

interface AccountRow { id: string; userId: string; provider: string }
let accountRows: AccountRow[] = [];
let audienceRows: Array<{
  capturedAt: Date; dimension: string; bucket: string; value: number; unit: string; audience: string;
}> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; userId: string } }) =>
        accountRows
          .filter((a) => a.userId === where.userId && (!where.id?.in || where.id.in.includes(a.id)))
          .map((a) => ({
            ...a, username: null, displayName: null, avatarUrl: null, followers: 100,
            status: "active", lastSyncedAt: null, lastSyncStatus: "ok", lastSyncError: null,
            timezone: null, healthScore: null, capabilitiesJson: null,
          })),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        accountRows.find((a) => a.id === where.id && a.userId === where.userId) ?? null,
      ),
    },
    socialAudienceSnapshot: {
      findMany: vi.fn(async ({ where }: { where: { accountId: string; capturedAt: { gte: Date } } }) =>
        audienceRows
          .filter((r) => r.capturedAt >= where.capturedAt.gte)
          .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())
          .filter(() => where.accountId !== undefined),
      ),
    },
    socialPost: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const call = (qs = "") => GET(new NextRequest(`http://localhost/api/social/audience?${qs}`));
const daysAgo = (n: number, ms = 0) => new Date(Date.now() - n * 86_400_000 + ms);

beforeEach(() => {
  subscriber = ALICE;
  audienceRows = [];
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
});

describe("GET /api/social/audience", () => {
  it("404s on another tenant's account", async () => {
    expect((await call(`accountIds=${BOB_ACC}`)).status).toBe(404);
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await call()).status).toBe(402);
  });

  it("400s on a window outside the supported range", async () => {
    expect((await call(`accountIds=${ALICE_ACC}&sinceDays=4000`)).status).toBe(400);
  });

  it("keeps every dimension from one capture, not just the last-written one", async () => {
    // Rows from a single sync do NOT share a capturedAt — each takes its own
    // now(), microseconds apart. Filtering on one exact timestamp is the bug
    // that silently dropped age and gender; this is its regression test.
    audienceRows = [
      { capturedAt: daysAgo(2, 0), dimension: "age", bucket: "18-24", value: 40, unit: "percent", audience: "followers" },
      { capturedAt: daysAgo(2, 1), dimension: "gender", bucket: "female", value: 60, unit: "percent", audience: "followers" },
      { capturedAt: daysAgo(2, 2), dimension: "country", bucket: "IN", value: 55, unit: "percent", audience: "followers" },
    ];
    const body = await (await call(`accountIds=${ALICE_ACC}`)).json();
    const dimensions = body.data.accounts[0].rows.map((r: { dimension: string }) => r.dimension);
    expect(new Set(dimensions)).toEqual(new Set(["age", "gender", "country"]));
  });

  it("keeps the newest row per bucket when a bucket was captured twice", async () => {
    audienceRows = [
      { capturedAt: daysAgo(9), dimension: "age", bucket: "18-24", value: 30, unit: "percent", audience: "followers" },
      { capturedAt: daysAgo(2), dimension: "age", bucket: "18-24", value: 44, unit: "percent", audience: "followers" },
    ];
    const body = await (await call(`accountIds=${ALICE_ACC}`)).json();
    expect(body.data.accounts[0].rows).toEqual([
      { dimension: "age", bucket: "18-24", value: 44, unit: "percent", audience: "followers" },
    ]);
  });

  it("keeps followers, reached and engaged apart — they are three populations", async () => {
    audienceRows = [
      { capturedAt: daysAgo(1, 0), dimension: "age", bucket: "18-24", value: 40, unit: "percent", audience: "followers" },
      { capturedAt: daysAgo(1, 1), dimension: "age", bucket: "18-24", value: 12, unit: "percent", audience: "reached" },
    ];
    const body = await (await call(`accountIds=${ALICE_ACC}`)).json();
    expect(body.data.accounts[0].rows).toHaveLength(2);
  });

  it("reports no capture date rather than a fake one when there is no data", async () => {
    const body = await (await call(`accountIds=${ALICE_ACC}`)).json();
    expect(body.data.accounts[0].capturedAt).toBeNull();
    expect(body.data.accounts[0].rows).toEqual([]);
  });
});
