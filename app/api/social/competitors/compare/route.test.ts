import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let subscriber: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => subscriber),
}));

interface AccountRow { id: string; userId: string; provider: string; followers: number | null }
interface CompetitorRow {
  id: string; userId: string; provider: string; handle: string; displayName: string | null;
  followers: number | null;
  snapshots: Array<{ capturedAt: Date; followers: number | null; engagementRate: number | null; postsPerWeek: number | null }>;
}
let accountRows: AccountRow[] = [];
let competitorRows: CompetitorRow[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] }; userId: string } }) =>
        accountRows
          .filter((a) => a.userId === where.userId && (!where.id?.in || where.id.in.includes(a.id)))
          .map((a) => ({
            ...a, username: null, displayName: null, avatarUrl: null,
            status: "active", lastSyncedAt: null, lastSyncStatus: "ok", lastSyncError: null,
            timezone: null, healthScore: null, capabilitiesJson: null,
          })),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        accountRows.find((a) => a.id === where.id && a.userId === where.userId) ?? null,
      ),
    },
    socialDailyMetric: { findMany: vi.fn(async () => []) },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    competitorProfile: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        competitorRows.filter((c) => c.userId === where.userId),
      ),
    },
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
const ALICE_IG = "clxaliceaccount01";
const ALICE_YT = "clxaliceaccount02";
const BOB_ACC = "clxbobaccount0001";

const call = (qs = "") => GET(new NextRequest(`http://localhost/api/social/competitors/compare?${qs}`));

beforeEach(() => {
  subscriber = ALICE;
  accountRows = [
    { id: ALICE_IG, userId: ALICE.userId, provider: "instagram", followers: 12_000 },
    { id: ALICE_YT, userId: ALICE.userId, provider: "youtube", followers: 4_000 },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram", followers: 1 },
  ];
  competitorRows = [
    {
      id: "c_ig", userId: ALICE.userId, provider: "instagram", handle: "rival", displayName: null,
      followers: 25_000,
      snapshots: [
        { capturedAt: new Date(), followers: 25_000, engagementRate: 3.1, postsPerWeek: 5 },
        { capturedAt: new Date(Date.now() - 7 * 86_400_000), followers: 24_500, engagementRate: 3, postsPerWeek: 4 },
      ],
    },
  ];
});

describe("GET /api/social/competitors/compare", () => {
  it("404s on another tenant's account", async () => {
    expect((await call(`accountIds=${BOB_ACC}`)).status).toBe(404);
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await call()).status).toBe(402);
  });

  it("computes each platform's share of the total audience", async () => {
    const body = await (await call()).json();
    const ig = body.data.platforms.find((p: { accountId: string }) => p.accountId === ALICE_IG);
    expect(ig.followerShare).toBeCloseTo(75);
  });

  it("compares a competitor only against our account on the same platform", async () => {
    const body = await (await call()).json();
    // 25,000 theirs − 12,000 ours on Instagram. Comparing against the YouTube
    // account would produce a gap between two unrelated audiences.
    expect(body.data.competitors[0].followerGap).toBe(13_000);
  });

  it("reports growth as null from a single snapshot rather than inventing it", async () => {
    competitorRows[0].snapshots = [competitorRows[0].snapshots[0]];
    const body = await (await call()).json();
    expect(body.data.competitors[0].weekGrowth).toBeNull();
  });

  it("returns an unknown benchmark rather than a verdict without data", async () => {
    const body = await (await call()).json();
    const verdicts = body.data.benchmarks.map((b: { verdict: string }) => b.verdict);
    expect(verdicts.every((v: string) => v === "unknown")).toBe(true);
  });

  it("returns empty structures, not an error, for a user with no accounts", async () => {
    accountRows = [];
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ platforms: [], competitors: [], benchmarks: [] });
  });
});
