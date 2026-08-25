// Cross-product stale-presigned-URL regression coverage for Streamer Video.
//
// Same defect as Split Screen and AutoClip P0-3: the job downloaded
// `Project.uploadedVideoUrl` — the presigned UPLOAD url, 6h lifetime — so any
// project older than six hours failed with `403 AccessDenied — Request has
// expired`. These tests drive the REAL job handler through the REAL shared
// resolver, and also pin that the drawtext title still reaches FFmpeg (the
// separate P0-2 concern must not regress while fixing source resolution).

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
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));

const downloadFile = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/utils/download", () => ({ downloadFile }));

const runStreamerFFmpeg = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/utils/ffmpeg-render", () => ({
  runStreamerFFmpeg,
  styleIndexToDrawtext: vi.fn((i: number) => ({ fontsize: 48, style: i })),
}));

const uploadFileToS3 = vi.hoisted(() => vi.fn(async () => "https://cdn.invalid/renders/project-1.mp4"));
const getAssetReadUrl = vi.hoisted(() => vi.fn(async (key: string) => `https://signed.invalid/${key}?fresh=1`));
vi.mock("@/utils/s3-upload", () => ({ uploadFileToS3, getAssetReadUrl }));

vi.mock("fs", () => ({
  default: { readFileSync: vi.fn(() => Buffer.from("")), unlinkSync: vi.fn(), existsSync: vi.fn(() => true) },
}));

const captured = vi.hoisted(() => ({ handler: null as null | ((p: unknown) => Promise<void>), enqueued: [] as unknown[] }));
vi.mock("@/lib/job-queue", () => ({
  InProcessQueue: class {
    constructor(_name: string, handler: (p: unknown) => Promise<void>) { captured.handler = handler; }
    enqueue(_id: string, payload: unknown) { captured.enqueued.push(payload); }
  },
}));

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
      return (arg as (tx: unknown) => Promise<unknown>)((await import("@/lib/prisma")).prisma);
    }),
  },
}));

const { POST } = await import("@/app/api/generate/streamer-video/route");

const TITLE = "My Stream Highlight";

function makeRequest() {
  return new NextRequest("http://localhost/api/generate/streamer-video", {
    method: "POST",
    body: JSON.stringify({ projectId: "project-1", titleText: TITLE, subtitleStyleIndex: 2 }),
    headers: { "content-type": "application/json" },
  });
}

const netSpend = () => state.ledger.filter((r) => r.refId === "streamer-video:project-1").reduce((s, r) => s - r.delta, 0);

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
  runStreamerFFmpeg.mockClear();
  runStreamerFFmpeg.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("Streamer Video — stale source URL", () => {
  it("processes an old project by re-minting the source, never fetching the expired URL", async () => {
    const res = await submitAndRunJob();
    expect(res.status).toBe(200);

    const fetched = downloadFile.mock.calls.map((c) => c[0] as string);
    expect(fetched).not.toContain(STALE_URL);
    expect(fetched.some((u) => u.includes("X-Amz-Signature"))).toBe(false);
    expect(getAssetReadUrl).toHaveBeenCalledWith(KEY);
    expect(fetched).toContain(`https://signed.invalid/${KEY}?fresh=1`);
    expect(state.updates.at(-1)).toMatchObject({ status: "completed" });
  });

  it("still renders the drawtext title through FFmpeg", async () => {
    await submitAndRunJob();

    expect(runStreamerFFmpeg).toHaveBeenCalledTimes(1);
    const opts = runStreamerFFmpeg.mock.calls[0][0] as { titleText: string; drawtextOpts: unknown; userVideoPath: string };
    expect(opts.titleText).toBe(TITLE);
    expect(opts.drawtextOpts).toBeTruthy();
    // FFmpeg receives the file downloaded from the FRESH url, not a stale fetch.
    expect(opts.userVideoPath).toContain("project-1");
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
    expect(reason).not.toMatch(/X-Amz|Signature|amazonaws|saas-video-editor-assets|HTTP 403/i);
    expect(netSpend()).toBe(0);
  });

  it("nets zero charge when the render itself fails", async () => {
    runStreamerFFmpeg.mockRejectedValue(new Error("FFmpeg exited with code 1"));
    await submitAndRunJob();
    expect(state.updates.find((u) => u.status === "failed")).toBeTruthy();
    expect(netSpend()).toBe(0);
  });

  it("still refunds when persisting the failure status throws", async () => {
    downloadFile.mockRejectedValue(new Error("Download failed: HTTP 500"));
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.project.update).mockImplementationOnce(() => { throw new Error("db down"); });

    await expect(submitAndRunJob()).resolves.toBeTruthy();
    expect(netSpend()).toBe(0);
  });

  it("does not mint for a key the project owner cannot be proven to own", async () => {
    state.ownerUserId = "user-2";
    state.assetRows = [];

    await submitAndRunJob();

    expect(getAssetReadUrl).not.toHaveBeenCalled();
    expect(downloadFile.mock.calls.map((c) => c[0])).toContain(STALE_URL);
  });
});
