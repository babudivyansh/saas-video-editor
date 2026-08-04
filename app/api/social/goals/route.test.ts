import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type User = { userId: string; email: string; sessionId: string };
// Two separate handles: a LAPSED subscriber is signed in but not paying, which
// is exactly the case the DELETE route has to keep serving.
let subscriber: User | null = null;
let authUser: User | null = null;
vi.mock("@/lib/auth", () => ({
  requireSubscriber: vi.fn(async () => subscriber),
  getAuthUser: vi.fn(async () => authUser),
}));

interface AccountRow { id: string; userId: string; provider: string }
interface GoalRow {
  id: string; userId: string; accountId: string | null; metric: string; target: number;
  baseline: number | null; startAt: Date; dueAt: Date; status: string;
}
let accountRows: AccountRow[] = [];
let goalRows: GoalRow[] = [];
let followerRows: Array<{ date: Date; followers: number }> = [];
const createGoal = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "g_new", ...data }));
const updateGoal = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
  ...goalRows.find((g) => g.id === where.id),
  ...data,
}));
const deleteGoal = vi.fn(async () => ({}));

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
    socialDailyMetric: {
      findMany: vi.fn(async () => followerRows.map((r) => ({ ...r, date: r.date }))),
    },
    socialAccountSnapshot: { findMany: vi.fn(async () => []) },
    socialGoal: {
      findMany: vi.fn(async ({ where }: { where: { userId: string; status?: string } }) =>
        goalRows.filter((g) => g.userId === where.userId && (!where.status || g.status === where.status)),
      ),
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
        goalRows.find((g) => g.id === where.id && g.userId === where.userId) ?? null,
      ),
      count: vi.fn(async ({ where }: { where: { userId: string } }) =>
        goalRows.filter((g) => g.userId === where.userId && g.status === "active").length,
      ),
      create: createGoal,
      update: updateGoal,
      delete: deleteGoal,
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

const { GET, POST } = await import("./route");
const { GET: GET_ONE, PATCH, DELETE } = await import("./[id]/route");

const ALICE = { userId: "user_alice", email: "a@x.com", sessionId: "s1" };
const ALICE_ACC = "clxaliceaccount01";
const BOB_ACC = "clxbobaccount0001";
const IN_30_DAYS = new Date(Date.now() + 30 * 86_400_000);

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/social/goals", { method: "POST", body: JSON.stringify(body) }));
const one = (id: string) =>
  GET_ONE(new NextRequest(`http://localhost/api/social/goals/${id}`), { params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) =>
  PATCH(new NextRequest(`http://localhost/api/social/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
const del = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/social/goals/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  subscriber = ALICE;
  authUser = ALICE;
  createGoal.mockClear();
  updateGoal.mockClear();
  deleteGoal.mockClear();
  followerRows = [];
  accountRows = [
    { id: ALICE_ACC, userId: ALICE.userId, provider: "instagram" },
    { id: BOB_ACC, userId: "user_bob", provider: "instagram" },
  ];
  goalRows = [
    {
      id: "goal_alice", userId: ALICE.userId, accountId: ALICE_ACC, metric: "followers",
      target: 15_000, baseline: 10_000, startAt: new Date(Date.now() - 10 * 86_400_000),
      dueAt: IN_30_DAYS, status: "active",
    },
    {
      id: "goal_bob", userId: "user_bob", accountId: BOB_ACC, metric: "followers",
      target: 999, baseline: 0, startAt: new Date(), dueAt: IN_30_DAYS, status: "active",
    },
  ];
});

describe("POST /api/social/goals", () => {
  it("404s when scoping a goal to another tenant's account", async () => {
    const res = await post({ accountId: BOB_ACC, metric: "followers", target: 100, dueAt: IN_30_DAYS });
    expect(res.status).toBe(404);
    expect(createGoal).not.toHaveBeenCalled();
  });

  it("402s a user without a subscription", async () => {
    subscriber = null;
    expect((await post({ metric: "followers", target: 100, dueAt: IN_30_DAYS })).status).toBe(402);
  });

  it("400s on a due date in the past", async () => {
    const res = await post({ metric: "followers", target: 100, dueAt: new Date(Date.now() - 86_400_000) });
    expect(res.status).toBe(400);
  });

  it("400s on a metric the engine does not compute", async () => {
    expect((await post({ metric: "vibes", target: 100, dueAt: IN_30_DAYS })).status).toBe(400);
  });

  it("captures the baseline at creation, so progress is not measured from zero", async () => {
    // 9k followers today, target 10k: 0% done, not 90%.
    followerRows = [{ date: new Date(Date.now() - 86_400_000), followers: 9_000 }];
    await post({ accountId: ALICE_ACC, metric: "followers", target: 10_000, dueAt: IN_30_DAYS });
    expect(createGoal.mock.calls[0][0].data.baseline).toBe(9_000);
  });

  it("stores a null baseline rather than 0 when nothing has been captured", async () => {
    await post({ accountId: ALICE_ACC, metric: "followers", target: 10_000, dueAt: IN_30_DAYS });
    expect(createGoal.mock.calls[0][0].data.baseline).toBeNull();
  });
});

describe("GET /api/social/goals", () => {
  it("returns only this tenant's goals", async () => {
    const res = await GET(new NextRequest("http://localhost/api/social/goals"));
    const body = await res.json();
    expect(body.data.goals).toHaveLength(1);
    expect(body.data.goals[0].goal.id).toBe("goal_alice");
  });

  it("marks a goal unmeasurable rather than reporting it as 0% done", async () => {
    const res = await GET(new NextRequest("http://localhost/api/social/goals"));
    const body = await res.json();
    expect(body.data.goals[0].measurable).toBe(false);
  });
});

describe("/api/social/goals/[id]", () => {
  it("404s on another tenant's goal for every verb", async () => {
    expect((await one("goal_bob")).status).toBe(404);
    expect((await patch("goal_bob", { target: 1 })).status).toBe(404);
    expect((await del("goal_bob")).status).toBe(404);
    expect(deleteGoal).not.toHaveBeenCalled();
  });

  it("does not rebase the baseline when the target is raised", async () => {
    // Raising a target moves the finish line, not the starting line — rebasing
    // would erase progress the user has already made.
    await patch("goal_alice", { target: 20_000 });
    expect(updateGoal.mock.calls[0][0].data).not.toHaveProperty("baseline");
    expect(updateGoal.mock.calls[0][0].data.target).toBe(20_000);
  });

  it("lets a lapsed subscriber delete their own goal", async () => {
    // Deletion is not subscriber-gated anywhere in this feature: someone who
    // stopped paying must still be able to remove their own data.
    subscriber = null; // lapsed, but still signed in
    expect((await del("goal_alice")).status).toBe(200);
    expect(deleteGoal).toHaveBeenCalled();
  });
});
