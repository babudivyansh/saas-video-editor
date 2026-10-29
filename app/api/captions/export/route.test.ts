// Caption Studio multi-ratio export: one charge per batch, one render per
// ratio, no second batch while one is running, nothing charged on refusal.

import { describe, expect, it, vi, beforeEach } from "vitest";

const spendCredits = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const getRenderRuntimeHealth = vi.hoisted(() => vi.fn());
const settleBatchIfDone = vi.hoisted(() => vi.fn(async () => "pending"));
const renderCount = vi.hoisted(() => vi.fn(async () => 0));
const renderCreate = vi.hoisted(() => vi.fn());
const renderDeleteMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));
const renderUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const projectFindFirst = vi.hoisted(() => vi.fn());
const assetFindMany = vi.hoisted(() => vi.fn());

const DOC = {
  version: 1, aspect: "9:16", fps: 30,
  tracks: {
    video: [{ id: "c1", type: "video", assetId: "a1", timelineStart: 0, duration: 4, srcIn: 0, volume: 1, muted: false }],
    text: [], audio: [], image: [], caption: [],
  },
};

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1" })),
  getUserTier: vi.fn(async () => "pro"),
}));
vi.mock("@/lib/plans/tiers", () => ({ tierPriority: () => 1 }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    projectRender: { count: renderCount, create: renderCreate },
  };
  return {
    prisma: {
      project: { findFirst: projectFindFirst },
      asset: { findMany: assetFindMany },
      projectRender: { deleteMany: renderDeleteMany, update: renderUpdate },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue }) }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: vi.fn(async (k: string) => `https://example.invalid/${k}`) }));
vi.mock("@/lib/credits", () => ({ spendCredits }));
vi.mock("@/utils/ffmpeg-render", () => ({ ffmpegBin: "/fake/ffmpeg" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/editor/caption-export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/editor/caption-export")>("@/lib/editor/caption-export");
  return { ...actual, captionExportJob: vi.fn(), settleBatchIfDone };
});
vi.mock("@/lib/render-runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/render-runtime")>("@/lib/render-runtime");
  return { ...actual, getRenderRuntimeHealth };
});

const { POST } = await import("./route");

const request = (body: unknown) =>
  ({ json: async () => body, url: "http://localhost/api/captions/export", method: "POST" }) as unknown as Parameters<typeof POST>[0];

let created = 0;
beforeEach(() => {
  vi.clearAllMocks();
  created = 0;
  projectFindFirst.mockResolvedValue({ id: "p1", userId: "user-1", productType: "captions", editorDoc: DOC });
  assetFindMany.mockResolvedValue([{ id: "a1", userId: "user-1", s3Key: "k1", width: 1920, height: 1080 }]);
  getRenderRuntimeHealth.mockResolvedValue({ ok: true });
  spendCredits.mockResolvedValue({ ok: true, balances: { total: 9 } });
  enqueue.mockResolvedValue(undefined);
  renderCount.mockResolvedValue(0);
  renderCreate.mockImplementation(async ({ data }: { data: { aspect: string; batchId: string } }) => ({ id: `r${++created}`, ...data }));
});

describe("POST /api/captions/export", () => {
  it("charges once and queues one render per ratio", async () => {
    const res = await POST(request({ projectId: "p1", aspects: ["9:16", "1:1", "16:9"] }));
    expect(res.status).toBe(202);
    expect(spendCredits).toHaveBeenCalledTimes(1);
    expect(spendCredits.mock.calls[0]![0]).toMatchObject({ amount: 1, reason: "spend:caption-export" });
    expect(renderCreate).toHaveBeenCalledTimes(3);
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(enqueue.mock.calls.map((c) => c[1].renderId)).toEqual(["r1", "r2", "r3"]);
    // Every row shares the batch the charge is filed under.
    const batch = renderCreate.mock.calls[0]![0].data.batchId;
    expect(spendCredits.mock.calls[0]![0].refId).toBe(`caption-export:${batch}`);
  });

  it("fixes the original frame from the video's own size", async () => {
    await POST(request({ projectId: "p1", aspects: ["original"] }));
    expect(enqueue.mock.calls[0]![1].size).toEqual({ w: 1920, h: 1080 });
  });

  it("refuses original when the video's size is unknown, before charging", async () => {
    assetFindMany.mockResolvedValue([{ id: "a1", userId: "user-1", s3Key: "k1", width: null, height: null }]);
    const res = await POST(request({ projectId: "p1", aspects: ["original"] }));
    expect(res.status).toBe(400);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("refuses a second batch while one is running, before charging", async () => {
    renderCount.mockResolvedValue(2);
    const res = await POST(request({ projectId: "p1", aspects: ["9:16"] }));
    expect(res.status).toBe(409);
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("removes the batch when the credit can't be spent", async () => {
    spendCredits.mockResolvedValue({ ok: false, balances: { total: 0 } });
    const res = await POST(request({ projectId: "p1", aspects: ["9:16", "4:5"] }));
    expect(res.status).toBe(402);
    expect(renderDeleteMany).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("refuses an unhealthy render runtime without charging", async () => {
    getRenderRuntimeHealth.mockResolvedValue({ ok: false, missingFilters: ["drawtext"] });
    const res = await POST(request({ projectId: "p1", aspects: ["9:16"] }));
    expect(res.status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("fails a ratio whose enqueue fails, then settles the batch", async () => {
    enqueue.mockRejectedValueOnce(new Error("redis down"));
    const res = await POST(request({ projectId: "p1", aspects: ["9:16", "1:1"] }));
    expect(res.status).toBe(202);
    expect(renderUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "r1" }, data: expect.objectContaining({ status: "failed" }) }));
    expect(settleBatchIfDone).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown and repeated shapes", async () => {
    expect((await POST(request({ projectId: "p1", aspects: ["2:3"] }))).status).toBe(400);
    expect((await POST(request({ projectId: "p1", aspects: ["9:16", "9:16"] }))).status).toBe(400);
    expect((await POST(request({ projectId: "p1", aspects: [] }))).status).toBe(400);
  });

  it("only exports the caller's own caption or editor projects", async () => {
    projectFindFirst.mockResolvedValue(null);
    expect((await POST(request({ projectId: "p1", aspects: ["9:16"] }))).status).toBe(404);
    expect(projectFindFirst.mock.calls[0]![0].where).toMatchObject({ userId: "user-1", productType: { in: ["captions", "editor"] } });
  });
});
