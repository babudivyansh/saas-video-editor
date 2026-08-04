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
/** Posts keyed by owning account, so the cross-account case is real. */
let postsByAccount: Record<string, string[]> = {};
const update = vi.fn(({ where, data }: { where: { id: string }; data: unknown }) => ({ where, data }));

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
    socialPost: {
      findMany: vi.fn(async ({ where }: { where: { accountId: string; id?: { in: string[] } } }) =>
        (postsByAccount[where.accountId] ?? [])
          .filter((id) => !where.id?.in || where.id.in.includes(id))
          .map((id) => ({ id, caption: "c", mediaType: "reel", publishedAt: new Date(), views: 100, likes: 5 })),
      ),
      update,
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}));

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const generatePostNarrations = vi.fn();
vi.mock("@/lib/social/ai/post-narration", () => ({ generatePostNarrations }));

const runCharged = vi.fn(async (_o: unknown, work: () => Promise<unknown>) => work());
vi.mock("@/lib/social/ai/charge", () => ({ runCharged: (o: unknown, w: () => Promise<unknown>) => runCharged(o, w) }));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const { POST } = await import("./route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/narrate", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  subscriber = ALICE;
  update.mockClear();
  runCharged.mockClear();
  generatePostNarrations.mockReset();
  generatePostNarrations.mockResolvedValue({
    narrations: [{ postId: "postalice000001", verdict: "typical", narration: "Mid-pack." }],
  });
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
  postsByAccount = { [ALICE_ACC]: ["postalice000001"], [BOB_ACC]: ["postbob00000001"] };
});

describe("POST /api/social/narrate", () => {
  it("404s on another tenant's account", async () => {
    expect((await post({ accountId: BOB_ACC, postIds: ["postbob00000001"] })).status).toBe(404);
  });

  it("404s on a post id that belongs to another tenant's account", async () => {
    // The ownership check is on the post query itself, not just the account —
    // otherwise a valid account plus a stolen post id would narrate, and store,
    // someone else's data.
    const res = await post({ accountId: ALICE_ACC, postIds: ["postbob00000001"] });
    expect(res.status).toBe(404);
    expect(runCharged).not.toHaveBeenCalled();
  });

  it("400s on a batch larger than one charge covers", async () => {
    const ids = Array.from({ length: 11 }, (_, i) => `postalice00000${i}`);
    expect((await post({ accountId: ALICE_ACC, postIds: ids })).status).toBe(400);
  });

  it("writes each narration back onto its own post", async () => {
    const res = await post({ accountId: ALICE_ACC, postIds: ["postalice000001"] });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      where: { id: "postalice000001" },
      data: { aiScoreReason: "typical: Mid-pack." },
    });
  });

  it("charges once for the batch", async () => {
    await post({ accountId: ALICE_ACC, postIds: ["postalice000001"] });
    expect(runCharged).toHaveBeenCalledTimes(1);
    expect((runCharged.mock.calls[0][0] as { toolSlug: string }).toolSlug).toBe("social-post-narration");
  });

  it("fails inside the charge — so it refunds — when nothing usable comes back", async () => {
    generatePostNarrations.mockResolvedValue({ narrations: [] });
    const res = await post({ accountId: ALICE_ACC, postIds: ["postalice000001"] });
    expect(res.status).toBe(502);
    expect(update).not.toHaveBeenCalled();
  });
});
