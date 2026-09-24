// @vitest-environment node
//
// The ledger contract for a FAILED AutoClip run.
//
// The create route charges a worst-case estimate under `auto-clip:{projectId}`
// before analysis starts. Until this suite existed, nothing but the SUCCESS
// path (settleRunCost) ever gave any of it back: a run that failed analysis or
// failed its render kept the whole charge, while the UI said "you haven't been
// charged". These tests run pickJob/renderJob against an in-memory ledger and
// assert the only thing that matters — what the user is still out of pocket.
//
// The other half of the contract is just as load-bearing: a failure that is
// about to be RETRIED must refund nothing, or the retry that then succeeds
// renders every clip for free.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "t", AWS_SECRET_ACCESS_KEY: "t", AWS_S3_BUCKET: "b", GEMINI_API_KEY: "k" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
const notify = vi.fn(async (_n: { type: string }) => {});
vi.mock("@/lib/notify", () => ({ notify }));
vi.mock("@/lib/email", () => ({ sendClipsReadyEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/source-url", () => ({ freshSourceUrl: vi.fn(async (u: string) => u) }));

const downloadFile = vi.fn(async (_url: string, _dest: string) => {});
vi.mock("@/utils/download", () => ({ downloadFile: (u: string, d: string) => downloadFile(u, d) }));

const probeMediaDuration = vi.fn(async () => ({ durationSec: 600 as number | null, reason: "", fileBytes: 1, stderrTail: "" }));
vi.mock("@/utils/ffmpeg-render", async (orig) => ({
  ...(await orig<typeof import("@/utils/ffmpeg-render")>()),
  probeMediaDuration: () => probeMediaDuration(),
}));

const userTier = vi.fn(async () => "pro");
vi.mock("@/lib/auth", () => ({ getUserTier: () => userTier() }));

// ── An in-memory credit ledger with restoreSpend's real semantics ──────────
// Net held per refId; restoreSpend with no amount returns all of it, and never
// more than is held.
const held = new Map<string, number>();
vi.mock("@/lib/credits", () => ({
  spendCredits: vi.fn(async ({ refId, amount }: { refId: string; amount: number }) => {
    held.set(refId, (held.get(refId) ?? 0) + amount);
    return { ok: true, balances: { total: 100 } };
  }),
  restoreSpend: vi.fn(async ({ refId, amount }: { refId: string; amount?: number }) => {
    const net = held.get(refId) ?? 0;
    const give = Math.min(net, amount ?? Number.MAX_SAFE_INTEGER);
    held.set(refId, net - give);
    return give;
  }),
  grantCredits: vi.fn(async () => {}),
}));

// ── Prisma: one project, its clips ─────────────────────────────────────────
type ClipRow = { id: string; status: string; durationSec: number; videoUrl: string | null; score: number | null };
let project: { id: string; userId: string; uploadedVideoUrl: string; status: string; failureReason: string | null };
let clips: ClipRow[];
const inIds = (where: { id?: { in: string[] }; status?: { in: string[] } | string }) => (c: ClipRow) =>
  (!where.id || where.id.in.includes(c.id)) &&
  (!where.status || (typeof where.status === "string" ? c.status === where.status : where.status.in.includes(c.status)));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => null) },
    project: {
      findUnique: vi.fn(async () => project),
      update: vi.fn(async ({ data }: { data: Partial<typeof project> }) => Object.assign(project, data)),
      // Conditional, like real Prisma: only moves the project if it is in the
      // status the caller expects — which is what makes finishing idempotent.
      updateMany: vi.fn(async ({ where, data }: { where: { status?: string }; data: Partial<typeof project> }) => {
        if (where.status && project.status !== where.status) return { count: 0 };
        Object.assign(project, data);
        return { count: 1 };
      }),
    },
    clip: {
      findMany: vi.fn(async ({ where }: { where: Parameters<typeof inIds>[0] }) => clips.filter(inIds(where))),
      deleteMany: vi.fn(async ({ where }: { where: Parameters<typeof inIds>[0] }) => {
        clips = clips.filter((c) => !inIds(where)(c));
        return { count: 0 };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Parameters<typeof inIds>[0]; data: Partial<ClipRow> }) => {
        const hit = clips.filter(inIds(where));
        hit.forEach((c) => Object.assign(c, data));
        return { count: hit.length };
      }),
    },
    // The pipeline reads the ledger directly to work out what is held; derive
    // it from the same in-memory map the credits mock writes.
    creditTransaction: {
      findMany: vi.fn(async ({ where }: { where: { refId: string } }) =>
        held.has(where.refId) ? [{ delta: -(held.get(where.refId) ?? 0) }] : []),
      count: vi.fn(async () => 1),
    },
  },
}));

const { pickJob, renderJob } = await import("./autoclip-pipeline");

const RUN = "auto-clip:p1";
const pickPayload = {
  projectId: "p1", minDuration: 15, maxDuration: 60, clipCount: 5, aspectRatio: "9:16" as const,
  instructions: "", captionStyleIndex: 0,
};
const FINAL = { attempt: 3, isFinal: true };
const NOT_FINAL = { attempt: 1, isFinal: false };

beforeEach(() => {
  vi.clearAllMocks();
  held.clear();
  held.set(RUN, 20); // what the create route took up front
  project = { id: "p1", userId: "u1", uploadedVideoUrl: "https://s3/src.mp4", status: "analyzing", failureReason: null };
  clips = [];
  downloadFile.mockResolvedValue(undefined);
  probeMediaDuration.mockResolvedValue({ durationSec: 600, reason: "", fileBytes: 1, stderrTail: "" });
  userTier.mockResolvedValue("pro");
});

describe("pickJob — a failed analysis", () => {
  it("returns the whole up-front charge when the video is too short", async () => {
    // NonRetryable, so final on ANY attempt — even the first.
    probeMediaDuration.mockResolvedValueOnce({ durationSec: 4, reason: "", fileBytes: 1, stderrTail: "" });
    await expect(pickJob(pickPayload, NOT_FINAL)).rejects.toThrow(/too short/);
    expect(held.get(RUN)).toBe(0);
    expect(project.status).toBe("failed");
  });

  it("returns the whole charge when the video is over the plan's length cap", async () => {
    // The cap is only knowable after download, i.e. after the charge.
    userTier.mockResolvedValue("free");
    probeMediaDuration.mockResolvedValueOnce({ durationSec: 4 * 3600, reason: "", fileBytes: 1, stderrTail: "" });
    await expect(pickJob(pickPayload, NOT_FINAL)).rejects.toThrow(/plan supports/);
    expect(held.get(RUN)).toBe(0);
  });

  it("returns the whole charge when the LAST attempt fails", async () => {
    downloadFile.mockRejectedValueOnce(new Error("S3 timeout"));
    await expect(pickJob(pickPayload, FINAL)).rejects.toThrow("S3 timeout");
    expect(held.get(RUN)).toBe(0);
    expect(project.status).toBe("failed");
  });

  it("keeps the charge, and the run alive, when the failure will be retried", async () => {
    // Refunding here would let the retry that then succeeds render for free;
    // showing "failed" here invited a second Generate — and a second charge —
    // while the retry was already on its way.
    downloadFile.mockRejectedValueOnce(new Error("S3 timeout"));
    await expect(pickJob(pickPayload, NOT_FINAL)).rejects.toThrow("S3 timeout");
    expect(held.get(RUN)).toBe(20);
    expect(project.status).toBe("analyzing");
  });
});

describe("renderJob — a failed render", () => {
  // renderJob only ever runs on a project the pick moved to "rendering".
  beforeEach(() => { project.status = "rendering"; });

  const queued = (): ClipRow[] => [
    { id: "c1", status: "queued", durationSec: 30, videoUrl: null, score: 60 },
    { id: "c2", status: "queued", durationSec: 30, videoUrl: null, score: 70 },
  ];

  it("returns everything held when nothing rendered and the last attempt fails", async () => {
    // The exact production case: the source download failed on every attempt.
    // The project went to "failed", which the stale-clip sweep never looks at,
    // so this charge was kept forever.
    clips = queued();
    downloadFile.mockRejectedValueOnce(new Error("source gone"));
    await expect(renderJob({ projectId: "p1" }, FINAL)).rejects.toThrow("source gone");
    expect(held.get(RUN)).toBe(0);
    expect(project.status).toBe("failed");
    expect(clips.every((c) => c.status === "failed")).toBe(true);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toMatchObject({ type: "autoclip_render_failed" });
  });

  it("refunds nothing, fails nothing and tells no one when the failure will be retried", async () => {
    clips = queued();
    downloadFile.mockRejectedValueOnce(new Error("blip"));
    await expect(renderJob({ projectId: "p1" }, NOT_FINAL)).rejects.toThrow("blip");
    expect(held.get(RUN)).toBe(20);
    expect(clips.every((c) => c.status === "queued")).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows finished clips as finished when a late failure follows real renders", async () => {
    // One clip rendered on an earlier attempt, the final attempt then died
    // before reaching the other: the run is completed, not failed, and the
    // user ends up paying for exactly the clip they got.
    clips = [
      { id: "c1", status: "ready", durationSec: 30, videoUrl: "https://s3/c1.mp4", score: 80 },
      { id: "c2", status: "queued", durationSec: 30, videoUrl: null, score: 50 },
    ];
    downloadFile.mockRejectedValueOnce(new Error("source gone"));
    await expect(renderJob({ projectId: "p1" }, FINAL)).rejects.toThrow("source gone");
    expect(project.status).toBe("completed");
    expect(clips.find((c) => c.id === "c2")!.status).toBe("failed");
    // Default pricing for the one delivered 30s clip: 1 clip × 1 + 1 block × 1.
    expect(held.get(RUN)).toBe(2);
  });
});

describe("finalizeRun — the one way a run ends", () => {
  it("is safe to reach twice: one refund, one status change, one notification", async () => {
    // renderJob, a retry of it, and the stale-clip sweep can all arrive here.
    // Each used to refund its own delta and send its own "clips are ready".
    const { finalizeRun } = await import("./autoclip-pipeline");
    project.status = "rendering";
    clips = [
      { id: "c1", status: "ready", durationSec: 30, videoUrl: "https://s3/c1.mp4", score: 80 },
      { id: "c2", status: "failed", durationSec: 30, videoUrl: null, score: 50 },
    ];
    await finalizeRun("p1", "u1");
    await finalizeRun("p1", "u1");
    expect(held.get(RUN)).toBe(2);
    expect(project.status).toBe("completed");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("returns the analysis advance too when nothing was delivered", async () => {
    const { finalizeRun } = await import("./autoclip-pipeline");
    held.set("auto-clip-analysis:p1", 1);
    project.status = "rendering";
    clips = [{ id: "c1", status: "failed", durationSec: 30, videoUrl: null, score: 50 }];
    await finalizeRun("p1", "u1", "boom");
    expect(held.get(RUN)).toBe(0);
    expect(held.get("auto-clip-analysis:p1")).toBe(0);
    expect(project.status).toBe("failed");
  });

  it("marks a retry that finds every clip already rendered as completed, not failed", async () => {
    // The previous attempt rendered everything and then died; the retry
    // finds no queued clips. It used to fail the project and say so.
    clips = [{ id: "c1", status: "ready", durationSec: 30, videoUrl: "https://s3/c1.mp4", score: 80 }];
    project.status = "rendering";
    await renderJob({ projectId: "p1" }, NOT_FINAL);
    expect(project.status).toBe("completed");
  });
});
