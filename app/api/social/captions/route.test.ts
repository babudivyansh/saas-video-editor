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

const generateCaptions = vi.fn(async () => ({ captions: [{ text: "c", tone: "warm" }], hashtags: [] }));
vi.mock("@/lib/social/ai/caption-hashtags", () => ({ generateCaptions, BRIEF_MAX_CHARS: 500 }));

const runCharged = vi.fn(async (_o: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/social/ai/charge", () => ({ runCharged: (o: unknown, w: () => Promise<unknown>) => runCharged(o, w) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/captions", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  subscriber = ALICE;
  runCharged.mockClear();
  generateCaptions.mockClear();
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
});

describe("POST /api/social/captions", () => {
  it("404s on another tenant's account", async () => {
    expect((await post({ accountId: BOB_ACC, brief: "a post about editing" })).status).toBe(404);
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await post({ accountId: ALICE_ACC, brief: "b" })).status).toBe(402);
  });

  it("400s on an empty or oversized brief", async () => {
    expect((await post({ accountId: ALICE_ACC, brief: "   " })).status).toBe(400);
    expect((await post({ accountId: ALICE_ACC, brief: "x".repeat(501) })).status).toBe(400);
  });

  it("drafts captions and charges once", async () => {
    const res = await post({ accountId: ALICE_ACC, brief: "behind the scenes", tone: "warm" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.captions.captions).toHaveLength(1);
    expect(runCharged).toHaveBeenCalledTimes(1);
  });

  it("keys the charge to the brief, so a retry is free and a rewrite is not", async () => {
    await post({ accountId: ALICE_ACC, brief: "behind the scenes" });
    await post({ accountId: ALICE_ACC, brief: "behind the scenes" });
    await post({ accountId: ALICE_ACC, brief: "a different idea" });
    const keys = runCharged.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });
});
