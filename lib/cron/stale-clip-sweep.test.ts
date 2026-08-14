import { beforeEach, describe, expect, it, vi } from "vitest";

let clipUpdateManyArgs: { where: unknown; data: unknown } | null = null;
let clipUpdateManyCount = 0;
let projectFindManyArgs: unknown = null;
let strandedProjects: Array<{ id: string; userId: string }> = [];
let clipsByProject: Record<string, Array<{ status: string; videoUrl: string | null; score: number | null; durationSec: number }>> = {};
const projectUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
const refundCalls: Array<{ projectId: string; amount: number }> = [];
const notifyCalls: Array<{ projectId: string; userId: string; outcome: string }> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clip: {
      updateMany: vi.fn(async (args: { where: unknown; data: unknown }) => {
        clipUpdateManyArgs = args;
        return { count: clipUpdateManyCount };
      }),
      findMany: vi.fn(async (args: { where: { projectId: string } }) => clipsByProject[args.where.projectId] ?? []),
    },
    project: {
      findMany: vi.fn(async (args: unknown) => {
        projectFindManyArgs = args;
        return strandedProjects;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        projectUpdates.push(args);
        return {};
      }),
    },
  },
}));

// Heavy ffmpeg/reframe module — mocked so the lazy import inside the reconciler
// resolves without loading it. computeCreditCost returns a fixed 100 so refund
// math is easy to assert.
vi.mock("@/lib/autoclip-pipeline", () => ({
  getAutoClipPricing: vi.fn(async () => ({})),
  computeCreditCost: vi.fn(() => 100),
  refundCredits: vi.fn(async (projectId: string, amount: number) => {
    refundCalls.push({ projectId, amount });
  }),
  notifyRenderOutcome: vi.fn(async (projectId: string, userId: string, outcome: string) => {
    notifyCalls.push({ projectId, userId, outcome });
  }),
}));

const { runStaleClipSweep, STALE_CLIP_TIMEOUT_MINUTES, RECONCILE_FAILURE_REASON } = await import("./stale-clip-sweep");

beforeEach(() => {
  clipUpdateManyArgs = null;
  clipUpdateManyCount = 0;
  projectFindManyArgs = null;
  strandedProjects = [];
  clipsByProject = {};
  projectUpdates.length = 0;
  refundCalls.length = 0;
  notifyCalls.length = 0;
  vi.clearAllMocks();
});

describe("runStaleClipSweep — clip sweep", () => {
  it("flips clips stuck at queued/rendering past the timeout to failed", async () => {
    clipUpdateManyCount = 3;
    const before = Date.now();
    const result = await runStaleClipSweep();
    expect(result).toEqual({ ok: true, swept: 3, reconciled: 0, at: expect.any(String) });
    expect(new Date(result.at).getTime()).toBeGreaterThanOrEqual(before);

    expect(clipUpdateManyArgs).not.toBeNull();
    const { where, data } = clipUpdateManyArgs as { where: { status: { in: string[] }; updatedAt: { lt: Date } }; data: { status: string } };
    expect(where.status).toEqual({ in: ["queued", "rendering"] });
    expect(data).toEqual({ status: "failed" });

    const expectedCutoff = Date.now() - STALE_CLIP_TIMEOUT_MINUTES * 60 * 1000;
    expect(Math.abs(where.updatedAt.lt.getTime() - expectedCutoff)).toBeLessThan(2000);
  });

  it("reports zero swept/reconciled when nothing is stale", async () => {
    clipUpdateManyCount = 0;
    const result = await runStaleClipSweep();
    expect(result.swept).toBe(0);
    expect(result.reconciled).toBe(0);
  });
});

describe("runStaleClipSweep — stranded project reconciliation", () => {
  it("only looks at 'rendering' projects with no active clip", async () => {
    await runStaleClipSweep();
    expect(projectFindManyArgs).toMatchObject({
      where: {
        status: "rendering",
        clips: { some: {}, none: { status: { in: ["queued", "rendering"] } } },
      },
    });
  });

  it("fails a stranded project with nothing rendered and refunds the whole charge", async () => {
    strandedProjects = [{ id: "p1", userId: "u1" }];
    clipsByProject["p1"] = [
      { status: "failed", videoUrl: null, score: null, durationSec: 30 },
      { status: "failed", videoUrl: null, score: null, durationSec: 40 },
    ];

    const result = await runStaleClipSweep();

    expect(result.reconciled).toBe(1);
    expect(projectUpdates).toEqual([
      { where: { id: "p1" }, data: { status: "failed", failureReason: RECONCILE_FAILURE_REASON } },
    ]);
    expect(refundCalls).toEqual([{ projectId: "p1", amount: 100 }]);
    expect(notifyCalls).toEqual([{ projectId: "p1", userId: "u1", outcome: "failed" }]);
  });

  it("completes a partially-rendered project, picks the best clip, and refunds proportionally", async () => {
    strandedProjects = [{ id: "p2", userId: "u2" }];
    clipsByProject["p2"] = [
      { status: "ready", videoUrl: "https://s3/best.mp4", score: 50, durationSec: 30 },
      { status: "ready", videoUrl: "https://s3/ok.mp4", score: 10, durationSec: 30 },
      { status: "failed", videoUrl: null, score: null, durationSec: 30 },
      { status: "failed", videoUrl: null, score: null, durationSec: 30 },
    ];

    const result = await runStaleClipSweep();

    expect(result.reconciled).toBe(1);
    expect(projectUpdates).toEqual([
      { where: { id: "p2" }, data: { status: "completed", videoUrl: "https://s3/best.mp4" } },
    ]);
    // 2 of 4 clips failed → refund round(100 * 2/4) = 50.
    expect(refundCalls).toEqual([{ projectId: "p2", amount: 50 }]);
    expect(notifyCalls).toEqual([{ projectId: "p2", userId: "u2", outcome: "completed" }]);
  });

  it("completes a fully-rendered stranded project without any refund", async () => {
    strandedProjects = [{ id: "p3", userId: "u3" }];
    clipsByProject["p3"] = [
      { status: "ready", videoUrl: "https://s3/a.mp4", score: 20, durationSec: 30 },
      { status: "ready", videoUrl: "https://s3/b.mp4", score: 80, durationSec: 30 },
    ];

    const result = await runStaleClipSweep();

    expect(result.reconciled).toBe(1);
    expect(projectUpdates).toEqual([
      { where: { id: "p3" }, data: { status: "completed", videoUrl: "https://s3/b.mp4" } },
    ]);
    expect(refundCalls).toEqual([]);
    expect(notifyCalls).toEqual([{ projectId: "p3", userId: "u3", outcome: "completed" }]);
  });
});
