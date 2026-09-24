// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type StaleClip = { id: string; project: { status: string } };
let staleClips: StaleClip[] = [];
let clipUpdateManyArgs: { where: Record<string, unknown>; data: unknown } | null = null;
let strandedRendering: Array<{ id: string; userId: string }> = [];
let stuckAnalyzing: Array<{ id: string; userId: string }> = [];
let analyzingClaim = 1;

const finalizeRun = vi.fn(async (..._a: unknown[]) => {});
const refundRunCharge = vi.fn(async (..._a: unknown[]) => 5);
const notifyRenderOutcome = vi.fn(async (..._a: unknown[]) => {});
const refundFailedRerender = vi.fn(async (_id: string) => {});
const restoreSpend = vi.fn(async (_a: unknown) => 1);

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    clip: {
      findMany: vi.fn(async () => staleClips),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: unknown }) => {
        clipUpdateManyArgs = args;
        return { count: staleClips.length };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    project: {
      findMany: vi.fn(async (args: { where: { status: string } }) =>
        args.where.status === "rendering" ? strandedRendering : stuckAnalyzing,
      ),
      updateMany: vi.fn(async () => ({ count: analyzingClaim })),
    },
  },
}));
vi.mock("@/lib/autoclip-pipeline", () => ({
  finalizeRun: (...a: unknown[]) => finalizeRun(...a),
  refundRunCharge: (...a: unknown[]) => refundRunCharge(...a),
  notifyRenderOutcome: (...a: unknown[]) => notifyRenderOutcome(...a),
}));
vi.mock("@/lib/autoclip-rerender", () => ({ refundFailedRerender: (id: string) => refundFailedRerender(id) }));
vi.mock("@/lib/credits", () => ({ restoreSpend: (a: unknown) => restoreSpend(a) }));
vi.mock("@/lib/autoclip-pricing", () => ({ analysisRefId: (id: string) => `auto-clip-analysis:${id}` }));

const {
  runStaleClipSweep, STALE_CLIP_TIMEOUT_MINUTES, STALE_QUEUED_TIMEOUT_MINUTES, RECONCILE_FAILURE_REASON,
  STRANDED_ANALYSIS_REASON,
} = await import("./stale-clip-sweep");

beforeEach(() => {
  vi.clearAllMocks();
  staleClips = [];
  clipUpdateManyArgs = null;
  strandedRendering = [];
  stuckAnalyzing = [];
  analyzingClaim = 1;
});

describe("stale clips", () => {
  it("gives a WAITING clip far longer than a rendering one", async () => {
    // Production renders one project at a time. A queue a few long sources
    // deep is normal; failing its clips at 18 minutes killed runs that were
    // simply waiting their turn.
    expect(STALE_QUEUED_TIMEOUT_MINUTES).toBeGreaterThanOrEqual(STALE_CLIP_TIMEOUT_MINUTES * 5);
    staleClips = [{ id: "c1", project: { status: "rendering" } }];
    await runStaleClipSweep();
    const or = (clipUpdateManyArgs!.where.OR as Array<{ status: string; updatedAt: { lt: Date } }>);
    const rendering = or.find((w) => w.status === "rendering")!.updatedAt.lt.getTime();
    const queued = or.find((w) => w.status === "queued")!.updatedAt.lt.getTime();
    expect(rendering - queued).toBeGreaterThan(60 * 60 * 1000);
  });

  it("refunds a stale clip that was a paid RE-render, not part of a run", async () => {
    // The project is completed, so this clip was re-rendering on its own. The
    // sweep used to fail it and keep the re-render charge.
    staleClips = [
      { id: "rerender-clip", project: { status: "completed" } },
      { id: "run-clip", project: { status: "rendering" } },
    ];
    const result = await runStaleClipSweep();
    expect(refundFailedRerender).toHaveBeenCalledTimes(1);
    expect(refundFailedRerender).toHaveBeenCalledWith("rerender-clip");
    expect(result.rerendersRefunded).toBe(1);
  });

  it("does nothing when nothing is stale", async () => {
    const result = await runStaleClipSweep();
    expect(result.swept).toBe(0);
    expect(clipUpdateManyArgs).toBeNull();
  });
});

describe("stranded rendering projects", () => {
  it("finishes each one through finalizeRun, which settles and notifies exactly once", async () => {
    strandedRendering = [{ id: "p1", userId: "u1" }, { id: "p2", userId: "u2" }];
    const result = await runStaleClipSweep();
    expect(finalizeRun).toHaveBeenCalledWith("p1", "u1", RECONCILE_FAILURE_REASON);
    expect(finalizeRun).toHaveBeenCalledWith("p2", "u2", RECONCILE_FAILURE_REASON);
    expect(result.reconciled).toBe(2);
  });

  it("keeps going when one project fails to reconcile", async () => {
    strandedRendering = [{ id: "p1", userId: "u1" }, { id: "p2", userId: "u2" }];
    finalizeRun.mockRejectedValueOnce(new Error("db blip"));
    const result = await runStaleClipSweep();
    expect(result.reconciled).toBe(1);
  });
});

describe("runs stuck on analyzing", () => {
  it("fails and fully refunds them — run charge AND analysis", async () => {
    // Nothing handled this state: a restart during analysis kept both charges
    // and left a project the create route refuses to re-claim.
    stuckAnalyzing = [{ id: "p9", userId: "u9" }];
    const result = await runStaleClipSweep();
    expect(refundRunCharge).toHaveBeenCalledWith("u9", "p9", expect.any(String));
    expect(restoreSpend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u9", refId: "auto-clip-analysis:p9" }));
    expect(notifyRenderOutcome).toHaveBeenCalledWith("p9", "u9", "failed", { reason: STRANDED_ANALYSIS_REASON });
    expect(result.analyzingFailed).toBe(1);
  });

  it("leaves a run alone if it started in the meantime", async () => {
    // The transition re-checks updatedAt, so a pick that just touched the
    // project loses nothing.
    stuckAnalyzing = [{ id: "p9", userId: "u9" }];
    analyzingClaim = 0;
    const result = await runStaleClipSweep();
    expect(refundRunCharge).not.toHaveBeenCalled();
    expect(result.analyzingFailed).toBe(0);
  });
});
