import { describe, it, expect, vi, beforeEach } from "vitest";

// Orchestration-level suite: prisma, credits and the queues are mocked, the
// same way lib/autoclip-dub.test.ts does it. What's under test is the ORDERING
// and the claims — the parts that decide whether a user gets charged twice.

const {
  restoreSpend, spendCredits, logToolGeneration,
  updateMany, update, findUnique, jobCount,
  enqueue,
} = vi.hoisted(() => ({
  restoreSpend: vi.fn(async () => 1),
  spendCredits: vi.fn(async () => ({ ok: true as const, balances: { bonus: 0, subscription: 0, purchased: 0, total: 100 }, breakdown: {} })),
  logToolGeneration: vi.fn(async () => {}),
  updateMany: vi.fn(async () => ({ count: 1 })),
  update: vi.fn(async () => ({})),
  findUnique: vi.fn(async () => null as unknown),
  jobCount: vi.fn(async () => 0),
  enqueue: vi.fn(async () => {}),
}));

vi.mock("@/lib/credits", () => ({
  spendCredits: (...a: unknown[]) => spendCredits(...(a as [])),
  restoreSpend: (...a: unknown[]) => restoreSpend(...(a as [])),
  logToolGeneration: (...a: unknown[]) => logToolGeneration(...(a as [])),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    captionRenderJob: {
      updateMany: (...a: unknown[]) => updateMany(...(a as [])),
      update: (...a: unknown[]) => update(...(a as [])),
      findUnique: (...a: unknown[]) => findUnique(...(a as [])),
      findFirst: vi.fn(async () => null),
      count: (...a: unknown[]) => jobCount(...(a as [])),
      create: vi.fn(async () => ({ id: "job_1" })),
    },
    clip: { findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    project: { findUnique: vi.fn(async () => ({ userId: "u1" })) },
    $transaction: vi.fn(async (ops: unknown) => (Array.isArray(ops) ? ops : [])),
  },
}));

vi.mock("@/lib/render-queue", () => ({
  createRenderQueue: () => ({ enqueue, driver: "in-process" }),
  NonRetryableError: class NonRetryableError extends Error {},
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => "pro") }));
vi.mock("@/lib/asset-service", () => ({ adoptExistingS3Object: vi.fn(async () => ({ asset: { id: "a1" } })) }));

// lib/env parses process.env at import time and this module's graph reaches it
// through utils/s3-upload, so it has to be stubbed or the suite fails at import
// on missing production secrets.
vi.mock("@/lib/env", () => ({ env: { SUBMAGIC_API_KEY: "sk-test", NEXT_PUBLIC_APP_URL: "https://test.local" } }));
// Media/S3 helpers are irrelevant to the claim-and-charge logic under test, and
// importing them for real pulls in the AWS SDK and the ffmpeg binary resolver.
vi.mock("@/utils/s3-upload", () => ({
  uploadFileToS3: vi.fn(async () => {}),
  getAssetReadUrl: vi.fn(async () => "https://s3.test/signed"),
  s3KeyToPublicUrl: (k: string) => `https://s3.test/${k}`,
}));
vi.mock("@/utils/download", () => ({ downloadFile: vi.fn(async () => {}) }));
vi.mock("@/utils/ffmpeg-render", () => ({ getMediaDurationSec: vi.fn(async () => 30) }));

const { claimAndEnqueueExport, claimAndEnqueueDownload, failCaptionRender } =
  await import("./caption-render-job");

const job = {
  id: "job_1",
  userId: "u1",
  refId: "caption-render:clip_1:0",
  status: "ready_to_edit",
  clip: { projectId: "proj_1" },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  updateMany.mockResolvedValue({ count: 1 });
});

describe("claimAndEnqueueExport", () => {
  it("claims via an atomic status transition, not a read-then-write", async () => {
    // A prior findFirst would be a stale snapshot; the UPDATE ... WHERE status
    // has to BE the check, or two concurrent requests both pass it.
    await claimAndEnqueueExport(job);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "job_1", status: { in: ["ready_to_edit", "editing"] } },
      data: { status: "export_queued" },
    });
  });

  it("accepts a job whose captions were edited, not just a fresh one", async () => {
    // Editing moves the job to "editing". Claiming only ready_to_edit would
    // deadlock every job that used the caption editor — the whole point of
    // autoRender=false.
    await claimAndEnqueueExport({ ...job, status: "editing" } as never);
    const arg = updateMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
    expect(arg.where.status.in).toContain("editing");
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("double-clicking Export enqueues exactly one render", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const first = await claimAndEnqueueExport(job);
    const second = await claimAndEnqueueExport(job);
    expect([first, second]).toEqual([true, false]);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("claimAndEnqueueDownload", () => {
  it("is a no-op when another worker already claimed the job", async () => {
    // This is what makes duplicate webhooks free: a redelivered callback racing
    // the reconciliation sweep loses the claim and does nothing.
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await claimAndEnqueueDownload(job)).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("claims from either in-flight state so a fast provider isn't stranded", async () => {
    await claimAndEnqueueDownload(job);
    const arg = updateMany.mock.calls[0][0] as { where: { status: { in: string[] } } };
    expect(arg.where.status.in).toEqual(expect.arrayContaining(["rendering", "export_queued"]));
  });

  it("a duplicate webhook and a sweep pass together ingest exactly once", async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await Promise.all([claimAndEnqueueDownload(job), claimAndEnqueueDownload(job)]);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("failCaptionRender", () => {
  it("refunds against the stored refId", async () => {
    await failCaptionRender(job, "TIMEOUT", "took too long");
    expect(restoreSpend).toHaveBeenCalledWith({
      userId: "u1",
      refId: "caption-render:clip_1:0",
      reason: "refund:caption-render-failed",
    });
  });

  it("marks the job failed with a bounded, user-facing message", async () => {
    await failCaptionRender(job, "X".repeat(200), "Y".repeat(900));
    const arg = update.mock.calls[0][0] as { data: { failureCode: string; failureMessage: string } };
    expect(arg.data.failureCode.length).toBeLessThanOrEqual(100);
    expect(arg.data.failureMessage.length).toBeLessThanOrEqual(500);
  });

  it("still marks the job failed when the refund itself throws", async () => {
    // Losing the failure record because a refund failed would leave the job
    // in-flight forever and the sweep re-checking it every 2 minutes.
    restoreSpend.mockRejectedValueOnce(new Error("ledger down"));
    await failCaptionRender(job, "X", "y");
    expect(update).toHaveBeenCalled();
  });

  it("does not attempt a refund for a job with no ledger reference", async () => {
    await failCaptionRender({ ...job, userId: null, refId: null } as never, "X", "y");
    expect(restoreSpend).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
  });
});
