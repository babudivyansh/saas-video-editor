import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.CRON_SECRET = "test-secret";

// Which batch a user.findMany call is for, read off its where clause.
type Batch = "nudge" | "day1" | "day3" | "day7" | "firstClips";
function batchOf(where: Record<string, unknown>): Batch {
  if ("activationNudgeSentAt" in where) return "nudge";
  if ("onboardingDay1SentAt" in where) return "day1";
  if ("onboardingDay3SentAt" in where) return "day3";
  if ("onboardingDay7SentAt" in where) return "day7";
  return "firstClips";
}

interface Row {
  id: string; email: string; name: string | null; minutes?: number;
  planId?: string | null; trialEndsAt?: Date | null; intendedUse?: string | null;
}
let rows: Record<Batch, Row[]>;
let startedRuns: Record<string, number>;
let readyClips: Record<string, number>;
const whereSeen: Partial<Record<Batch, Record<string, unknown>>> = {};

const userUpdate = vi.fn(async (_a: { where: { id: string }; data: Record<string, unknown> }) => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const b = batchOf(where);
        whereSeen[b] = where;
        return rows[b];
      }),
      update: (a: { where: { id: string }; data: Record<string, unknown> }) => userUpdate(a),
    },
    project: {
      count: vi.fn(async ({ where }: { where: { userId: string } }) => startedRuns[where.userId] ?? 0),
    },
    clip: {
      count: vi.fn(async ({ where }: { where: { project: { userId: string } } }) => readyClips[where.project.userId] ?? 0),
    },
  },
}));

const shouldSendCategory = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/notifications", () => ({ shouldSendCategory: (...a: unknown[]) => shouldSendCategory(...a) }));
vi.mock("@/lib/cron-tracking", () => ({ withCronTracking: (_n: string, fn: unknown) => fn }));

const sendFirstRunNudgeEmail = vi.fn(async (..._a: unknown[]) => {});
const sendOnboardingDay1Email = vi.fn(async (..._a: unknown[]) => {});
const sendOnboardingDay3Email = vi.fn(async (..._a: unknown[]) => {});
const sendOnboardingDay7Email = vi.fn(async (..._a: unknown[]) => {});
const sendFirstVideoSuccessEmail = vi.fn(async (..._a: unknown[]) => true);
vi.mock("@/lib/email", () => ({
  sendFirstRunNudgeEmail: (...a: unknown[]) => sendFirstRunNudgeEmail(...a),
  sendOnboardingDay1Email: (...a: unknown[]) => sendOnboardingDay1Email(...a),
  sendOnboardingDay3Email: (...a: unknown[]) => sendOnboardingDay3Email(...a),
  sendOnboardingDay7Email: (...a: unknown[]) => sendOnboardingDay7Email(...a),
  sendFirstVideoSuccessEmail: (...a: unknown[]) => sendFirstVideoSuccessEmail(...a),
}));

const { GET } = await import("./route");

function run() {
  return GET(new NextRequest("http://localhost/api/cron/onboarding", { headers: { Authorization: "Bearer test-secret" } }));
}

function stamped(userId: string, field: string): boolean {
  return userUpdate.mock.calls.some(([a]) => a.where.id === userId && field in a.data);
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = { nudge: [], day1: [], day3: [], day7: [], firstClips: [] };
  startedRuns = {};
  readyClips = {};
  sendFirstVideoSuccessEmail.mockResolvedValue(true);
});

describe("GET /api/cron/onboarding", () => {
  it("rejects a request without the cron secret", async () => {
    const res = await GET(new NextRequest("http://localhost/api/cron/onboarding"));
    expect(res.status).toBe(401);
  });

  it("1-hour nudge: signups 1–24h old, worded by intendedUse, skipped once a run started", async () => {
    rows.nudge = [
      { id: "g", email: "g@t.co", name: "G", minutes: 30, intendedUse: "gaming" },
      { id: "busy", email: "busy@t.co", name: "B", minutes: 10, intendedUse: null },
    ];
    startedRuns = { busy: 1 };
    const body = await (await run()).json();

    const where = whereSeen.nudge as { createdAt: { gte: Date; lte: Date } };
    expect(Date.now() - where.createdAt.lte.getTime()).toBeGreaterThanOrEqual(60 * 60 * 1000 - 1000);
    expect(Math.round((Date.now() - where.createdAt.gte.getTime()) / 3_600_000)).toBe(24);
    expect(sendFirstRunNudgeEmail).toHaveBeenCalledTimes(1);
    expect(sendFirstRunNudgeEmail).toHaveBeenCalledWith("g@t.co", "G", 30, "gaming");
    expect(stamped("g", "activationNudgeSentAt")).toBe(true);
    expect(stamped("busy", "activationNudgeSentAt")).toBe(true);
    expect(body.nudge).toBe(1);
  });

  it("day 1 nudges only users who never started an AutoClip run, and stamps everyone", async () => {
    rows.day1 = [
      { id: "idle", email: "idle@t.co", name: "Idle", minutes: 30 },
      { id: "busy", email: "busy@t.co", name: "Busy", minutes: 12 },
    ];
    startedRuns = { busy: 1 };
    const body = await (await run()).json();

    expect(sendOnboardingDay1Email).toHaveBeenCalledTimes(1);
    expect(sendOnboardingDay1Email).toHaveBeenCalledWith("idle@t.co", "Idle", 30);
    expect(stamped("idle", "onboardingDay1SentAt")).toBe(true);
    expect(stamped("busy", "onboardingDay1SentAt")).toBe(true);
    expect(body).toMatchObject({ day1: 1, day1Skipped: 1 });
  });

  it("day 3 branches on ready AutoClip clips, not on credits", async () => {
    rows.day3 = [
      { id: "a", email: "a@t.co", name: "A" },
      { id: "b", email: "b@t.co", name: "B" },
    ];
    readyClips = { a: 7 };
    await run();
    expect(sendOnboardingDay3Email).toHaveBeenCalledWith("a@t.co", "A", 7, true);
    expect(sendOnboardingDay3Email).toHaveBeenCalledWith("b@t.co", "B", 0, false);
  });

  it("day 7 sends the minutes balance and only queries free users", async () => {
    rows.day7 = [{ id: "f", email: "f@t.co", name: "F", minutes: 18 }];
    await run();
    expect(whereSeen.day7).toMatchObject({ planId: null });
    expect(sendOnboardingDay7Email).toHaveBeenCalledWith("f@t.co", "F", 18);
  });

  describe("first-clips upsell", () => {
    it("only looks at recent signups with a completed AutoClip run at least 2h old", async () => {
      await run();
      const where = whereSeen.firstClips as {
        firstVideoAt: null;
        createdAt: { gte: Date };
        projects: { some: { productType: string; status: string; updatedAt: { lte: Date } } };
      };
      expect(where.firstVideoAt).toBeNull();
      expect(where.projects.some).toMatchObject({ productType: "auto-clip", status: "completed" });
      const ageMs = Date.now() - where.projects.some.updatedAt.lte.getTime();
      expect(ageMs).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 1000);
      const accountWindowDays = (Date.now() - where.createdAt.gte.getTime()) / 86_400_000;
      expect(Math.round(accountWindowDays)).toBe(30);
    });

    it("emails a free user with their clip count and stamps firstVideoAt", async () => {
      rows.firstClips = [{ id: "u", email: "u@t.co", name: "Ada", planId: null, trialEndsAt: null }];
      readyClips = { u: 5 };
      const body = await (await run()).json();
      expect(sendFirstVideoSuccessEmail).toHaveBeenCalledWith("u@t.co", "Ada", 5);
      expect(stamped("u", "firstVideoAt")).toBe(true);
      expect(body.firstClips).toBe(1);
    });

    it("stamps paying and trialing users without an email", async () => {
      rows.firstClips = [
        { id: "paid", email: "p@t.co", name: "P", planId: "pro", trialEndsAt: null },
        { id: "trial", email: "t@t.co", name: "T", planId: null, trialEndsAt: new Date(Date.now() + 86_400_000) },
      ];
      readyClips = { paid: 3, trial: 3 };
      await run();
      expect(sendFirstVideoSuccessEmail).not.toHaveBeenCalled();
      expect(stamped("paid", "firstVideoAt")).toBe(true);
      expect(stamped("trial", "firstVideoAt")).toBe(true);
    });

    it("leaves firstVideoAt unset when the send fails, so the next hourly run retries", async () => {
      rows.firstClips = [{ id: "u", email: "u@t.co", name: "Ada", planId: null, trialEndsAt: null }];
      readyClips = { u: 2 };
      sendFirstVideoSuccessEmail.mockResolvedValueOnce(false);
      await run();
      expect(stamped("u", "firstVideoAt")).toBe(false);

      sendFirstVideoSuccessEmail.mockRejectedValueOnce(new Error("resend down"));
      await run();
      expect(stamped("u", "firstVideoAt")).toBe(false);
    });

    it("skips (without stamping) a user whose clips were all deleted", async () => {
      rows.firstClips = [{ id: "u", email: "u@t.co", name: "Ada", planId: null, trialEndsAt: null }];
      await run();
      expect(sendFirstVideoSuccessEmail).not.toHaveBeenCalled();
      expect(stamped("u", "firstVideoAt")).toBe(false);
    });
  });
});
