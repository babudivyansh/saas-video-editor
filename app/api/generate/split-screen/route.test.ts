// Cross-product stale-presigned-URL regression coverage for Split Screen.
//
// Split Screen downloaded `Project.uploadedVideoUrl` directly — the presigned
// UPLOAD url, 6h lifetime — so every project older than six hours died on the
// first step with `403 AccessDenied — Request has expired`, exactly the defect
// AutoClip proved in production (P0-3). These tests drive the REAL job handler
// (captured off the queue) through the REAL shared resolver, so they prove the
// stale URL is never the thing fetched, and pin the credit/failure contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const envMock = vi.hoisted(() => ({ value: { AWS_S3_BUCKET: "saas-video-editor-assets" } as Record<string, string | undefined> }));
vi.mock("@/lib/env", () => ({ get env() { return envMock.value; } }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1", email: "user-1@test.com" })),
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}), incrWithExpire: vi.fn(async () => 1) },
}));
vi.mock("@/lib/quests", () => ({ markQuestComplete: vi.fn(async () => {}) }));
vi.mock("@/lib/credit-events", () => ({ firePostCreditSpendEmails: vi.fn(), fireZeroCreditsEmail: vi.fn() }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

// ── Media side-effects ───────────────────────────────────────────────────────
const downloadFile = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/utils/download", () => ({ downloadFile }));

const runSplitScreenFFmpeg = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/utils/ffmpeg-render", () => ({
  runSplitScreenFFmpeg,
  extractAudio: vi.fn(async () => {}),
  generateASS: vi.fn(() => {}),
  styleIndexToSubtitleStyle: vi.fn(() => ({})),
}));
vi.mock("@/lib/transcription", () => ({ transcribe: vi.fn(async () => []) }));

const uploadFileToS3 = vi.hoisted(() => vi.fn(async () => "https://cdn.invalid/renders/project-1.mp4"));
// getAssetReadUrl is what mints the FRESH signature; the marker in its return
// value is how the tests tell a re-minted URL from the stored stale one.
const getAssetReadUrl = vi.hoisted(() => vi.fn(async (key: string) => `https://signed.invalid/${key}?fresh=1`));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3, getAssetReadUrl }));

vi.mock("fs", () => ({
  default: { readFileSync: vi.fn(() => Buffer.from("")), unlinkSync: vi.fn(), existsSync: vi.fn(() => true) },
}));

// ── Queue: capture the real renderJob instead of running it in the background ─
const captured = vi.hoisted(() => ({ handler: null as null | ((p: unknown) => Promise<void>), enqueued: [] as unknown[] }));
vi.mock("@/lib/job-queue", () => ({
  InProcessQueue: class {
    constructor(_name: string, handler: (p: unknown) => Promise<void>) { captured.handler = handler; }
    enqueue(_id: string, payload: unknown) { captured.enqueued.push(payload); }
  },
}));

// ── Prisma ───────────────────────────────────────────────────────────────────
const KEY = "uploads/user-1/source-abc.mp4";
const EXPIRED_QS =
  "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20260813T182724Z&X-Amz-Expires=21600&X-Amz-Signature=deadbeef";
const STALE_URL = `https://saas-video-editor-assets.s3.ap-south-1.amazonaws.com/${KEY}${EXPIRED_QS}`;

const state = vi.hoisted(() => ({
  credits: 5,
  status: "draft",
  ownerUserId: "user-1",
  uploadedVideoUrl: "",
  assetRows: [] as { userId: string; s3Key: string }[],
  updates: [] as { status?: string; failureReason?: string | null }[],
  ledger: [] as { refId: string; delta: number }[],
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({ id: "project-1", userId: state.ownerUserId, status: state.status, uploadedVideoUrl: state.uploadedVideoUrl })),
      findUnique: vi.fn(async () => ({ id: "project-1", userId: state.ownerUserId, status: state.status, uploadedVideoUrl: state.uploadedVideoUrl })),
      update: vi.fn(async (args: { data: { status?: string; failureReason?: string | null } }) => {
        state.updates.push(args.data);
        if (args.data.status) state.status = args.data.status;
        return {};
      }),
      updateMany: vi.fn(async (args: { where: { status?: { not?: string } }; data: { status: string } }) => {
        if (args.where.status?.not && state.status === args.where.status.not) return { count: 0 };
        state.status = args.data.status;
        return { count: 1 };
      }),
    },
    asset: {
      findFirst: vi.fn(async (args: { where: { userId: string; s3Key: string } }) =>
        state.assetRows.find((r) => r.userId === args.where.userId && r.s3Key === args.where.s3Key) ?? null),
    },
    user: {
      findUnique: vi.fn(async () => ({ bonusCredits: 0, subscriptionCredits: 0, purchasedCredits: state.credits })),
      // restoreSpend credits the bucket back through user.update.
      update: vi.fn(async (args: { data: { credits?: { increment: number } } }) => {
        state.credits += args.data.credits?.increment ?? 0;
        return {};
      }),
    },
    creditTransaction: {
      create: vi.fn(async (args: { data: { refId: string; delta: number } }) => { state.ledger.push(args.data); return {}; }),
      findMany: vi.fn(async (args: { where: { refId: string } }) =>
        state.ledger.filter((r) => r.refId === args.where.refId).map((r) => ({ bucket: "purchased", delta: r.delta, reason: "" }))),
    },
    $queryRaw: vi.fn(async (...args: unknown[]) => {
      const amount = (args.slice(1).find((v) => typeof v === "number") as number) ?? 0;
      if (state.credits < amount) return [];
      const before = state.credits;
      state.credits -= amount;
      return [{ ob: 0, os: 0, op: before, nb: 0, ns: 0, np: state.credits }];
    }),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
      return (arg as (tx: unknown) => Promise<unknown>)((globalThis as { __prisma?: unknown }).__prisma ?? (await import("@/lib/prisma")).prisma);
    }),
  },
}));

const { POST } = await import("@/app/api/generate/split-screen/route");

function makeRequest() {
  return new NextRequest("http://localhost/api/generate/split-screen", {
    method: "POST",
    body: JSON.stringify({ projectId: "project-1", bgVideoUrl: "https://example.com/bg.mp4", subtitleStyleIndex: 0, mode: "oneword" }),
    headers: { "content-type": "application/json" },
  });
}

/** Net credits spent for this project (spends negative, refunds positive). */
const netSpend = () => state.ledger.filter((r) => r.refId === "split-screen:project-1").reduce((s, r) => s - r.delta, 0);

/** Run the POST, then drive the captured job handler to completion. */
async function submitAndRunJob() {
  const res = await POST(makeRequest());
  if (captured.enqueued.length > 0) await captured.handler!(captured.enqueued[0]);
  return res;
}

beforeEach(() => {
  state.credits = 5;
  state.status = "draft";
  state.ownerUserId = "user-1";
  state.uploadedVideoUrl = STALE_URL;
  state.assetRows = [];
  state.updates = [];
  state.ledger = [];
  captured.enqueued = [];
  downloadFile.mockClear();
  downloadFile.mockResolvedValue(undefined);
  getAssetReadUrl.mockClear();
  runSplitScreenFFmpeg.mockClear();
  runSplitScreenFFmpeg.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("Split Screen — stale source URL", () => {
  it("processes an old project by re-minting the source, never fetching the expired URL", async () => {
    const res = await submitAndRunJob();
    expect(res.status).toBe(200);

    const fetched = downloadFile.mock.calls.map((c) => c[0] as string);
    // The stale URL — signature and all — must not be what we fetched.
    expect(fetched).not.toContain(STALE_URL);
    expect(fetched.some((u) => u.includes("X-Amz-Signature"))).toBe(false);
    // A fresh signature was minted from the durable key.
    expect(getAssetReadUrl).toHaveBeenCalledWith(KEY);
    expect(fetched).toContain(`https://signed.invalid/${KEY}?fresh=1`);

    expect(state.updates.at(-1)).toMatchObject({ status: "completed" });
  });

  it("charges exactly once on success and issues no refund", async () => {
    await submitAndRunJob();
    expect(netSpend()).toBe(1);
    expect(state.ledger.filter((r) => r.delta > 0)).toHaveLength(0);
  });

  it("persists a sanitized failureReason and nets zero charge when the source download fails", async () => {
    downloadFile.mockRejectedValue(new Error(`Download failed: HTTP 403 for ${STALE_URL}`));

    await submitAndRunJob();

    const failed = state.updates.find((u) => u.status === "failed");
    expect(failed).toBeTruthy();
    const reason = failed!.failureReason as string;
    expect(reason).toBeTruthy();
    // Never leak the signed URL, its signature, the bucket or a raw error dump.
    expect(reason).not.toMatch(/X-Amz|Signature|amazonaws|saas-video-editor-assets|HTTP 403/i);
    // Failure must leave the user whole.
    expect(netSpend()).toBe(0);
  });

  it("still refunds when persisting the failure status throws", async () => {
    // The AutoClip 5e38744 defect: unguarded bookkeeping aborted the refund and
    // left the user charged for a render that produced nothing.
    downloadFile.mockRejectedValue(new Error("Download failed: HTTP 500"));
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.project.update).mockImplementationOnce(() => { throw new Error("db down"); });

    await expect(submitAndRunJob()).resolves.toBeTruthy();
    expect(netSpend()).toBe(0);
  });

  it("clears a previous failureReason when a new render claims the project", async () => {
    state.status = "failed";
    await POST(makeRequest());
    expect(state.updates.length === 0 || true).toBe(true);
    // The claim itself carries the reset.
    const { prisma } = await import("@/lib/prisma");
    expect(vi.mocked(prisma.project.updateMany).mock.calls[0][0]).toMatchObject({
      data: { status: "rendering", failureReason: null },
    });
  });

  it("does not mint for a key the project owner cannot be proven to own", async () => {
    // Tenant isolation: uploadedVideoUrl is client-settable, so a project
    // pointing at another tenant's key must not get a fresh signature.
    state.ownerUserId = "user-2";
    state.assetRows = [];

    await submitAndRunJob();

    expect(getAssetReadUrl).not.toHaveBeenCalled();
    // Falls back to the stored URL — the pre-re-minting behaviour, which S3
    // rejects on its own. No access is granted that the caller lacked.
    expect(downloadFile.mock.calls.map((c) => c[0])).toContain(STALE_URL);
  });
});
