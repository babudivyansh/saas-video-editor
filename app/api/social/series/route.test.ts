import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────
let subscriber: { userId: string; email: string; sessionId: string } | null = null;
let authUser: typeof subscriber = null;

vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => authUser),
}));

interface Row { id: string; userId: string; provider: string }
let accountRows: Row[] = [];

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
  },
}));

let rateLimitAllowed = true;
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ allowed: rateLimitAllowed, remaining: 0 })),
}));

const store = new Map<string, string>();
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    del: vi.fn(async (k: string) => { store.delete(k); }),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { GET } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const BOB = { userId: "user_bob", email: "b@x.com", sessionId: "s2" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const call = (qs: string) => GET(new NextRequest(`http://localhost/api/social/series?${qs}`));

beforeEach(() => {
  subscriber = ALICE;
  authUser = ALICE;
  rateLimitAllowed = true;
  store.clear();
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: BOB.userId, provider: "youtube" },
  ];
});

describe("auth", () => {
  it("402s a non-subscriber", async () => {
    subscriber = null;
    const res = await call(`accountIds=${ALICE_ACC}&metrics=followers`);
    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({ code: "subscription_required" });
  });
});

describe("validation", () => {
  it("400s with no accountIds", async () => {
    expect((await call("metrics=followers")).status).toBe(400);
  });

  it("400s with no metrics", async () => {
    expect((await call(`accountIds=${ALICE_ACC}`)).status).toBe(400);
  });

  it("400s on an unknown metric", async () => {
    const res = await call(`accountIds=${ALICE_ACC}&metrics=vibes`);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Validation failed" });
  });

  it("400s on an unknown timezone rather than silently using UTC", async () => {
    expect((await call(`accountIds=${ALICE_ACC}&metrics=followers&tz=Mars/Olympus`)).status).toBe(400);
  });

  it("400s past the accounts x metrics cap", async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `clxaliceaccount0${i}`).join(",");
    const metrics = "followers,reach,views,likes,comments,shares"; // 8 x 6 = 48 > 40
    expect((await call(`accountIds=${ids}&metrics=${metrics}`)).status).toBe(400);
  });

  it("reports which field failed", async () => {
    const res = await call(`accountIds=${ALICE_ACC}&metrics=followers&range=13`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.issues.some((i: { path: string }) => i.path === "range")).toBe(true);
  });
});

describe("tenancy", () => {
  // With no Postgres RLS, this is the regression test for the only control
  // standing between customers.
  it("404s on another tenant's accountId", async () => {
    const res = await call(`accountIds=${BOB_ACC}&metrics=followers`);
    expect(res.status).toBe(404);
  });

  it("404s the whole batch when one id belongs to someone else", async () => {
    const res = await call(`accountIds=${ALICE_ACC},${BOB_ACC}&metrics=followers`);
    expect(res.status).toBe(404);
    // And leaks nothing about the account that did resolve.
    expect(JSON.stringify(await res.json())).not.toContain(ALICE_ACC);
  });

  it("404s on an id that does not exist", async () => {
    expect((await call("accountIds=clxdoesnotexist01&metrics=followers")).status).toBe(404);
  });

  it("reports a cross-tenant id and a missing id identically", async () => {
    const cross = await (await call(`accountIds=${BOB_ACC}&metrics=followers`)).json();
    const missing = await (await call("accountIds=clxdoesnotexist01&metrics=followers")).json();
    expect(cross).toEqual(missing);
  });
});

describe("rate limiting", () => {
  it("429s with Retry-After", async () => {
    rateLimitAllowed = false;
    const res = await call(`accountIds=${ALICE_ACC}&metrics=followers`);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

describe("success", () => {
  it("returns a series per account x metric", async () => {
    const res = await call(`accountIds=${ALICE_ACC}&metrics=followers,reach`);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.series).toHaveLength(2);
    expect(data.series.map((s: { metric: string }) => s.metric)).toEqual(["followers", "reach"]);
  });

  it("echoes the resolved range and granularity", async () => {
    const { data } = await (await call(`accountIds=${ALICE_ACC}&metrics=followers&range=90&granularity=week&tz=Asia/Kolkata`)).json();
    expect(data.range).toMatchObject({ granularity: "week", tz: "Asia/Kolkata" });
  });

  it("marks a metric the provider cannot supply as unavailable, with no points", async () => {
    accountRows = [{ id: ALICE_ACC, userId: ALICE.userId, provider: "youtube" }];
    const { data } = await (await call(`accountIds=${ALICE_ACC}&metrics=impressions`)).json();
    // YouTube impressions are Studio-only — an empty line of zeros would be a lie.
    expect(data.series[0]).toMatchObject({ available: "unavailable", points: [] });
  });

  it("adds a shifted comparison series when asked", async () => {
    const { data } = await (await call(`accountIds=${ALICE_ACC}&metrics=followers&compare=previous`)).json();
    expect(data.series).toHaveLength(2);
    expect(data.series[1].accountId).toBe(`${ALICE_ACC}:previous`);
  });

  it("defaults to no comparison", async () => {
    const { data } = await (await call(`accountIds=${ALICE_ACC}&metrics=followers`)).json();
    expect(data.series).toHaveLength(1);
  });
});
