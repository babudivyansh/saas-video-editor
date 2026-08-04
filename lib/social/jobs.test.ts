import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/redis", () => ({
  redis: {
    get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}),
    incrWithExpire: vi.fn(async () => 1),
  },
}));

const syncAccount = vi.fn(async () => {});
vi.mock("./service", () => ({ syncAccount }));

interface Account { id: string; userId: string; provider: string; lastDailyMetricDate: Date | null }
interface Goal {
  id: string; userId: string; accountId: string | null; metric: string; target: number;
  baseline: number | null; startAt: Date; dueAt: Date; status: string;
}
let accounts: Account[] = [];
let goals: Goal[] = [];
let posts: Array<Record<string, unknown>> = [];
let followerDays: Array<{ date: Date; followers: number }> = [];

const updatePost = vi.fn(async () => ({}));
const updateAccount = vi.fn(async () => ({}));
const updateGoal = vi.fn(async () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    socialAccount: {
      findMany: vi.fn(async ({ where }: { where?: { id?: string; userId?: string } } = {}) =>
        accounts
          .filter((a) => (!where?.id || a.id === where.id) && (!where?.userId || a.userId === where.userId))
          .map((a) => ({
            ...a, username: null, displayName: null, avatarUrl: null, followers: 100,
            status: "active", lastSyncedAt: null, lastSyncStatus: "ok", lastSyncError: null,
            timezone: null, healthScore: null, capabilitiesJson: null,
          })),
      ),
      update: updateAccount,
    },
    socialPost: { findMany: vi.fn(async () => posts), update: updatePost },
    socialDailyMetric: { findMany: vi.fn(async () => followerDays) },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    socialGoal: {
      findMany: vi.fn(async ({ where }: { where: { status: string } }) =>
        goals.filter((g) => g.status === where.status),
      ),
      update: updateGoal,
    },
  },
}));

const { evaluateGoals, recomputeScores, syncDailyMetrics } = await import("./jobs");

const NOW = new Date("2026-08-04T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

/** Enough comparable posts to clear MIN_VIRAL_COHORT. */
const cohortPosts = () =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`, caption: `post ${i}`, mediaType: "reel", publishedAt: daysAgo(i + 1),
    views: 1000 + i * 100, likes: 50 + i, comments: 5, shares: 2, saves: 1,
    reach: 900 + i * 100, impressions: null, watchTimeSec: null, avgWatchTimeSec: null,
    avgViewPercentage: 40 + i, ctr: null,
  }));

beforeEach(() => {
  syncAccount.mockClear();
  updatePost.mockClear();
  updateAccount.mockClear();
  updateGoal.mockClear();
  posts = [];
  followerDays = [];
  accounts = [{ id: "acc1", userId: "u1", provider: "instagram", lastDailyMetricDate: null }];
  goals = [];
});

describe("syncDailyMetrics", () => {
  it("syncs the accounts whose history has fallen behind", async () => {
    const result = await syncDailyMetrics(NOW);
    expect(result).toEqual({ considered: 1, synced: 1, failed: 0 });
    expect(syncAccount).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one account's provider fails", async () => {
    // One revoked token must not freeze every other account's history.
    accounts = [
      { id: "acc1", userId: "u1", provider: "instagram", lastDailyMetricDate: null },
      { id: "acc2", userId: "u2", provider: "youtube", lastDailyMetricDate: null },
    ];
    syncAccount.mockRejectedValueOnce(new Error("token revoked"));
    const result = await syncDailyMetrics(NOW);
    expect(result).toEqual({ considered: 2, synced: 1, failed: 1 });
  });
});

describe("recomputeScores", () => {
  it("writes null, not zero, when the cohort is too small to rank", async () => {
    // Zero is a score. "We cannot rank this yet" is not, and conflating them
    // makes a new account's whole library read as worthless.
    posts = [{
      id: "p1", caption: "only post", mediaType: "reel", publishedAt: daysAgo(1),
      views: 100, likes: 5, comments: 1, shares: 0, saves: 0, reach: 90,
      impressions: null, watchTimeSec: null, avgWatchTimeSec: null, avgViewPercentage: null, ctr: null,
    }];
    await recomputeScores(NOW);
    expect(updatePost.mock.calls[0][0].data).toMatchObject({ viralScore: null, aiScore: null });
  });

  it("scores a post once its cohort is big enough", async () => {
    posts = cohortPosts();
    const result = await recomputeScores(NOW);
    expect(result.postsScored).toBe(8);
    const scored = updatePost.mock.calls.map((c) => c[0].data.aiScore).filter((s) => s !== null);
    expect(scored.length).toBeGreaterThan(0);
  });

  it("stamps the *At columns so staleness is visible", async () => {
    posts = cohortPosts();
    await recomputeScores(NOW);
    expect(updatePost.mock.calls[0][0].data.viralScoreAt).toEqual(NOW);
    expect(updateAccount.mock.calls.at(-1)![0].data.healthScoreAt).toEqual(NOW);
  });

  it("writes a null health score rather than 0 for an account with no inputs", async () => {
    await recomputeScores(NOW);
    expect(updateAccount.mock.calls.at(-1)![0].data.healthScore).toBeNull();
  });
});

describe("evaluateGoals", () => {
  const activeGoal = (over: Partial<Goal> = {}): Goal => ({
    id: "g1", userId: "u1", accountId: "acc1", metric: "followers", target: 1_000,
    baseline: 500, startAt: daysAgo(30), dueAt: new Date(NOW.getTime() + 30 * 86_400_000),
    status: "active", ...over,
  });

  it("does nothing when there are no active goals", async () => {
    expect(await evaluateGoals(NOW)).toEqual({ evaluated: 0, hit: 0, missed: 0 });
  });

  it("records a hit rather than leaving it to be re-derived later", async () => {
    // "You hit 1,000 on the 3rd" has to survive dropping back to 998 on the
    // 4th, which a live comparison against the current value cannot do.
    goals = [activeGoal()];
    followerDays = [{ date: daysAgo(1), followers: 1_050 }];
    const result = await evaluateGoals(NOW);
    expect(result.hit).toBe(1);
    expect(updateGoal.mock.calls[0][0].data).toMatchObject({ status: "hit" });
  });

  it("marks an overdue goal missed", async () => {
    goals = [activeGoal({ dueAt: daysAgo(1) })];
    followerDays = [{ date: daysAgo(2), followers: 600 }];
    const result = await evaluateGoals(NOW);
    expect(result.missed).toBe(1);
    expect(updateGoal.mock.calls[0][0].data).toEqual({ status: "missed" });
  });

  it("leaves an in-progress goal alone", async () => {
    goals = [activeGoal()];
    followerDays = [{ date: daysAgo(1), followers: 700 }];
    const result = await evaluateGoals(NOW);
    expect(result).toMatchObject({ evaluated: 1, hit: 0, missed: 0 });
    expect(updateGoal).not.toHaveBeenCalled();
  });
});
