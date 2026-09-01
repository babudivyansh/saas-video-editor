import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Regression guard mirroring app/api/generate/compile/route.test.ts's H6
// double-submit test: two concurrent confirms for the same project must not
// both charge credits and both enqueue a render.

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1", email: "user-1@test.com" })),
  getUserTier: vi.fn(async () => "creator"),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));

const enqueue = vi.fn();
vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: vi.fn(() => ({ enqueue, driver: "in-process" })),
}));

vi.mock("@/lib/autoclip-pipeline", () => ({
  renderJob: vi.fn(async () => {}),
  computeCreditCost: vi.fn((clipCount: number) => clipCount), // 1 credit/clip, deterministic for the test
  getAutoClipPricing: vi.fn(async () => ({ perClip: 1, perTwoMinutes: 1, analysisPerHalfHour: 1, rerender: 1 })),
  getAnalysisCreditsPaid: vi.fn(async () => 0),
}));

let credits = 10;
let chargedAmounts: number[] = [];
let projectStatus = "pending_review";
const CLIPS = [
  { id: "clip-1", projectId: "project-1", index: 0, startSec: 0, endSec: 10, durationSec: 10, aspectRatio: "9:16", status: "pending_review" },
  { id: "clip-2", projectId: "project-1", index: 1, startSec: 10, endSec: 20, durationSec: 10, aspectRatio: "9:16", status: "pending_review" },
];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "project-1", userId: "user-1", status: projectStatus })),
      // Mirrors real Prisma: only affects rows matching `where`, so it's the
      // atomic guard — two concurrent calls against the same row can't both
      // see it as still "pending_review".
      updateMany: vi.fn(async (args: { where: { status?: string }; data: { status: string } }) => {
        if (projectStatus === args.where.status) {
          projectStatus = args.data.status;
          return { count: 1 };
        }
        return { count: 0 };
      }),
      update: vi.fn(async (args: { data: { status: string } }) => {
        projectStatus = args.data.status;
      }),
    },
    clip: {
      findMany: vi.fn(async () => CLIPS.filter((c) => c.status === "pending_review")),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => ({ id: where.id, ...(data as object) })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    user: {
      update: vi.fn(async () => {
        credits -= 1;
        return { credits };
      }),
      findUnique: vi.fn(async () => ({ bonusCredits: 0, subscriptionCredits: 0, purchasedCredits: credits })),
    },
    creditTransaction: { create: vi.fn(async () => ({})) },
    // The route now honours the admin enable/disable switch for auto-clip
    // (lib/tool-config reads it from Config); absent row = shipped defaults.
    config: { findUnique: vi.fn(async () => null) },
    // Analytics-only Generation row (logToolGeneration) — best-effort, but the
    // mock needs the model to exist so it isn't silently swallowing a TypeError.
    generation: { create: vi.fn(async () => ({ id: "gen-1" })) },
    // lib/credits spendCredits drains buckets via one raw CTE UPDATE inside a
    // callback transaction; model the whole balance as the purchased bucket.
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      // Extract the amount (first interpolated number) from the tagged template.
      const amount = (args.slice(1).find((v) => typeof v === "number") as number) ?? 0;
      if (credits < amount) return [];
      const before = credits;
      credits -= amount;
      chargedAmounts.push(amount);
      return [{ ob: 0, os: 0, op: before, nb: 0, ns: 0, np: credits }];
    }),
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)((await import("@/lib/prisma")).prisma);
    }),
  },
}));

const { POST } = await import("./route");

function makeRequest() {
  return new NextRequest("http://localhost/api/projects/project-1/clips/confirm", {
    method: "POST",
    body: JSON.stringify({ clips: [{ id: "clip-1", keep: true }, { id: "clip-2", keep: true }] }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/projects/[id]/clips/confirm — double submit", () => {
  beforeEach(() => {
    credits = 10;
    chargedAmounts = [];
    projectStatus = "pending_review";
    enqueue.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("charges credits and enqueues exactly once even when confirmed twice concurrently", async () => {
    const params = Promise.resolve({ id: "project-1" });
    const [first, second] = await Promise.all([
      POST(makeRequest(), { params }),
      POST(makeRequest(), { params }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(enqueue).toHaveBeenCalledTimes(1);
    // Charged the real computed cost exactly once, not twice. (Previously the
    // user.update mock decremented a flat 1; the bucket-aware spend now
    // charges the mocked pricing's actual cost through $queryRaw.)
    expect(credits).toBe(10 - chargedAmounts[0]);
    expect(chargedAmounts).toHaveLength(1);
  });
});
