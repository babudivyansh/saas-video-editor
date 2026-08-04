import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The AI layer's client imports lib/env at module scope; the test process has
// no real secrets and does not need them.
vi.mock("@/lib/env", () => ({ env: { GEMINI_API_KEY: "test", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } }));

let subscriber: { userId: string; email: string; sessionId: string } | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => subscriber),
}));

interface Row { id: string; userId: string; provider: string }
let accountRows: Row[] = [];
let dailyRows: Array<Record<string, unknown>> = [];

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
    // Honours the window: the route asks twice (current, previous) and the
    // whole point of the escalation test is that the two differ.
    socialDailyMetric: {
      findMany: vi.fn(async ({ where }: { where: { date: { gte: Date; lt: Date } } }) =>
        dailyRows.filter(
          (r) => (r.date as Date) >= where.date.gte && (r.date as Date) < where.date.lt,
        ),
      ),
    },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    socialPost: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    del: vi.fn(async (k: string) => { store.delete(k); }),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const explainKpi = vi.fn();
vi.mock("@/lib/social/ai/kpi-explain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/social/ai/kpi-explain")>("@/lib/social/ai/kpi-explain");
  return { ...actual, explainKpi };
});
const runCharged = vi.fn(async (_opts: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/social/ai/charge", () => ({ runCharged: (o: unknown, w: () => Promise<unknown>) => runCharged(o, w) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/social/kpi-explain?${qs}`));

/** A day's worth of one metric, `n` days before now. */
const day = (daysAgo: number, over: Record<string, number>) => ({
  date: new Date(Date.now() - daysAgo * 86_400_000),
  ...over,
});

beforeEach(() => {
  subscriber = ALICE;
  store.clear();
  explainKpi.mockReset();
  runCharged.mockClear();
  dailyRows = [];
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
});

describe("GET /api/social/kpi-explain", () => {
  it("404s on another tenant's account without confirming it exists", async () => {
    const res = await call(`accountId=${BOB_ACC}&metric=views`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Account not found");
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await call(`accountId=${ALICE_ACC}&metric=views`)).status).toBe(402);
  });

  it("400s on a metric the engine does not compute", async () => {
    expect((await call(`accountId=${ALICE_ACC}&metric=virality`)).status).toBe(400);
  });

  it("answers a metric this platform cannot report without calling the model", async () => {
    // avgViewPercentage is unavailable on Instagram — the deterministic template
    // owns this case, and spending a model call on it would be waste.
    const res = await call(`accountId=${ALICE_ACC}&metric=avgViewPercentage`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.source).toBe("computed");
    expect(body.data.explanation.headline).toContain("not reported by this platform");
    expect(explainKpi).not.toHaveBeenCalled();
    expect(runCharged).not.toHaveBeenCalled();
  });

  it("answers 'no data yet' without calling the model", async () => {
    const res = await call(`accountId=${ALICE_ACC}&metric=views`);
    const body = await res.json();
    expect(body.data.source).toBe("computed");
    expect(body.data.explanation.headline).toContain("has been collected yet");
    expect(explainKpi).not.toHaveBeenCalled();
  });

  it("escalates an unexplained movement to the model and caches the answer", async () => {
    // Views halved while posting barely moved: nothing in the template explains
    // it, which is exactly the case worth a call.
    dailyRows = [
      day(5, { views: 1_000, postsPublished: 5 }), // current window
      day(40, { views: 4_000, postsPublished: 5 }), // previous window
    ];
    explainKpi.mockResolvedValue({ metric: "views", headline: "h", detail: "d", confidence: "low" });

    const first = await call(`accountId=${ALICE_ACC}&metric=views`);
    const body = await first.json();
    expect(body.data.source).toBe("model");
    expect(explainKpi).toHaveBeenCalledTimes(1);

    await call(`accountId=${ALICE_ACC}&metric=views`);
    // Second identical request is served from cache — no second model call and
    // no second charge.
    expect(explainKpi).toHaveBeenCalledTimes(1);
  });
});
