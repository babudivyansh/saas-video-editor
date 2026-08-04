import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

let subscriber: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => subscriber),
}));

interface Row { id: string; userId: string; provider: string }
let accountRows: Row[] = [];
let posts: Array<Record<string, unknown>> = [];
const createInsight = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "rec1", ...data }));

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
    socialDailyMetric: { findMany: vi.fn(async () => []) },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    socialPost: { findMany: vi.fn(async () => posts) },
    aiInsight: { findFirst: vi.fn(async () => null), create: createInsight },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const generateContentRecommendations = vi.fn(async () => ({ recommendations: [{ title: "t" }] }));
const generateScheduleSuggestions = vi.fn(async () => ({ slots: [], summary: "s" }));
vi.mock("@/lib/social/ai/content-recommendations", () => ({ generateContentRecommendations }));
vi.mock("@/lib/social/ai/schedule-suggestions", () => ({ generateScheduleSuggestions }));

const runCharged = vi.fn(async (_o: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/social/ai/charge", () => ({ runCharged: (o: unknown, w: () => Promise<unknown>) => runCharged(o, w) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET, POST } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/recommendations", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  subscriber = ALICE;
  posts = [{ id: "p1", caption: "hi", mediaType: "reel", publishedAt: new Date(), views: 100, likes: 10 }];
  createInsight.mockClear();
  runCharged.mockClear();
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
});

describe("/api/social/recommendations", () => {
  it("404s on another tenant's account, on both verbs", async () => {
    expect((await post({ accountId: BOB_ACC })).status).toBe(404);
    expect(
      (await GET(new NextRequest(`http://localhost/api/social/recommendations?accountId=${BOB_ACC}`))).status,
    ).toBe(404);
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await post({ accountId: ALICE_ACC })).status).toBe(402);
  });

  it("stores content recommendations and schedule suggestions under one charge", async () => {
    const res = await post({ accountId: ALICE_ACC });
    expect(res.status).toBe(201);
    expect(runCharged).toHaveBeenCalledTimes(1);
    const stored = createInsight.mock.calls[0][0].data.content as Record<string, unknown>;
    expect(stored.recommendations).toBeDefined();
    expect(stored.schedule).toEqual({ slots: [], summary: "s" });
  });

  it("409s rather than charging when there are no posts to reason about", async () => {
    posts = [];
    expect((await post({ accountId: ALICE_ACC })).status).toBe(409);
    expect(runCharged).not.toHaveBeenCalled();
  });
});
