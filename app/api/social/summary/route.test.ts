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
let storedInsight: { id: string; kind: string; createdAt: Date } | null = null;
const createInsight = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "ins1", ...data }));

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
    aiInsight: { findFirst: vi.fn(async () => storedInsight), create: createInsight },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const generateExecutiveSummary = vi.fn();
vi.mock("@/lib/social/ai/executive-summary", () => ({ generateExecutiveSummary }));

const runCharged = vi.fn(async (_o: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/social/ai/charge", () => ({ runCharged: (o: unknown, w: () => Promise<unknown>) => runCharged(o, w) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET, POST } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/summary", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  subscriber = ALICE;
  posts = [{ id: "p1", caption: "hi", mediaType: "reel", publishedAt: new Date(), views: 100, likes: 10 }];
  storedInsight = null;
  createInsight.mockClear();
  runCharged.mockClear();
  generateExecutiveSummary.mockReset();
  generateExecutiveSummary.mockResolvedValue({
    summary: "s", wins: [], concerns: [], recommendations: [{ title: "t", rationale: "r", metric: null, effort: "low" }],
  });
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
});

describe("/api/social/summary", () => {
  it("404s on another tenant's account, on both verbs", async () => {
    expect((await post({ accountId: BOB_ACC, period: "monthly" })).status).toBe(404);
    expect((await GET(new NextRequest(`http://localhost/api/social/summary?accountId=${BOB_ACC}`))).status).toBe(404);
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await post({ accountId: ALICE_ACC })).status).toBe(402);
  });

  it("400s on an unknown period", async () => {
    expect((await post({ accountId: ALICE_ACC, period: "fortnightly" })).status).toBe(400);
  });

  it("generates and stores a summary under its period's kind", async () => {
    const res = await post({ accountId: ALICE_ACC, period: "monthly" });
    expect(res.status).toBe(201);
    expect(createInsight.mock.calls[0][0].data.kind).toBe("executive_summary_monthly");
    expect(generateExecutiveSummary.mock.calls[0][1]).toBe("monthly");
  });

  it("returns a fresh summary without charging for it", async () => {
    storedInsight = { id: "old", kind: "executive_summary_weekly", createdAt: new Date() };
    const res = await post({ accountId: ALICE_ACC, period: "weekly" });
    const body = await res.json();
    expect(body.data.cached).toBe(true);
    expect(runCharged).not.toHaveBeenCalled();
  });

  it("regenerates once the stored summary is past its period", async () => {
    storedInsight = {
      id: "old",
      kind: "executive_summary_weekly",
      createdAt: new Date(Date.now() - 8 * 86_400_000),
    };
    expect((await post({ accountId: ALICE_ACC, period: "weekly" })).status).toBe(201);
    expect(runCharged).toHaveBeenCalledTimes(1);
  });

  it("keys the weekly charge to a real ISO week, not a date", async () => {
    await post({ accountId: ALICE_ACC, period: "weekly" });
    expect((runCharged.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey).toMatch(/:\d{4}-W\d{2}$/);
  });

  it("409s rather than charging for a summary of nothing", async () => {
    posts = [];
    const res = await post({ accountId: ALICE_ACC, period: "monthly" });
    expect(res.status).toBe(409);
    expect(runCharged).not.toHaveBeenCalled();
  });
});
