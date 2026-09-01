import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Mock state ────────────────────────────────────────────────────────────────
let authUser: { userId: string } | null;
let completedQuests: Array<{ questId: string; completedAt: Date }>;
let userRow: { claimedRankRewards: string[]; rankRewardsSeenAt: Date | null } | null;
let creditTransactions: Array<{ reason: string; createdAt: Date }>;
let redisStore: Map<string, string>;

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => authUser) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userQuest: {
      findMany: vi.fn(async () => completedQuests),
    },
    user: {
      findUnique: vi.fn(async () => userRow),
    },
    creditTransaction: {
      findMany: vi.fn(async ({ where }: { where: { reason: { in: string[] }; createdAt?: { gt: Date } } }) =>
        creditTransactions
          .filter(t => where.reason.in.includes(t.reason))
          .filter(t => !where.createdAt || t.createdAt > where.createdAt.gt)
          .map(t => ({ reason: t.reason })),
      ),
    },
  },
}));

vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async (k: string) => redisStore.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => { redisStore.set(k, v); }),
  },
}));

import { GET } from "./route";

const req = () => new NextRequest("http://localhost/api/quests");

beforeEach(() => {
  authUser = { userId: "u1" };
  completedQuests = [];
  userRow = { claimedRankRewards: [], rankRewardsSeenAt: null };
  creditTransactions = [];
  redisStore = new Map();
  vi.clearAllMocks();
});

describe("GET /api/quests", () => {
  it("401s without a session", async () => {
    authUser = null;
    expect((await GET(req())).status).toBe(401);
  });

  it("returns every quest with derived XP, level and remaining count", async () => {
    completedQuests = [{ questId: "join-community", completedAt: new Date("2026-09-01") }];

    const body = await (await GET(req())).json();

    expect(body.quests).toHaveLength(11);
    expect(body.earnedXp).toBe(500);
    expect(body.totalXp).toBe(2800);
    expect(body.remaining).toBe(10);
    expect(body.level).toBe("Creator");
    expect(body.allComplete).toBe(false);
  });

  it("reports allComplete once nothing is left", async () => {
    const ids = [
      "join-community", "first-clip", "hear-yourself-out", "picture-this", "first-video",
      "first-export", "upgraded-plan", "explore-toolbox", "complete-profile", "track-account",
      "refer-friend",
    ];
    completedQuests = ids.map(questId => ({ questId, completedAt: new Date("2026-09-01") }));

    const body = await (await GET(req())).json();

    expect(body.remaining).toBe(0);
    expect(body.allComplete).toBe(true);
    expect(body.earnedXp).toBe(2800);
    expect(body.level).toBe("Clipiro Master");
  });

  it("surfaces an unacknowledged rank reward", async () => {
    userRow = { claimedRankRewards: ["Creator"], rankRewardsSeenAt: null };
    creditTransactions = [{ reason: "grant:quest-rank-Creator", createdAt: new Date("2026-09-01") }];

    const body = await (await GET(req())).json();

    expect(body.newRankRewards).toEqual([{ level: "Creator", reward: 5 }]);
  });

  it("does not re-announce a reward granted before the last acknowledgement", async () => {
    userRow = { claimedRankRewards: ["Creator"], rankRewardsSeenAt: new Date("2026-09-02") };
    creditTransactions = [{ reason: "grant:quest-rank-Creator", createdAt: new Date("2026-09-01") }];

    const body = await (await GET(req())).json();

    expect(body.newRankRewards).toEqual([]);
  });

  // The regression this endpoint's cache split exists to prevent: the quest
  // payload is cached for 300s, so folding newRankRewards into that blob would
  // keep replaying an already-acknowledged toast for the rest of the TTL.
  it("recomputes rank rewards on a cache hit rather than serving the cached copy", async () => {
    userRow = { claimedRankRewards: ["Creator"], rankRewardsSeenAt: null };
    creditTransactions = [{ reason: "grant:quest-rank-Creator", createdAt: new Date("2026-09-01") }];

    const first = await (await GET(req())).json();
    expect(first.newRankRewards).toEqual([{ level: "Creator", reward: 5 }]);
    expect(redisStore.has("quests:u1")).toBe(true);

    // User acknowledges; the cached quest payload is untouched and still warm.
    userRow = { claimedRankRewards: ["Creator"], rankRewardsSeenAt: new Date("2026-09-03") };

    const second = await (await GET(req())).json();
    expect(second.quests).toHaveLength(11);
    expect(second.newRankRewards).toEqual([]);
  });
});
