// P0-2 fail-closed gate.
//
// During the outage every export charged a credit and enqueued a render that
// could not succeed, because the deployed ffmpeg lacked `drawtext`. Refunds
// fired afterwards, but the service was knowingly selling a guaranteed
// failure. These tests pin the corrected behaviour: an unhealthy runtime is
// refused before any credit is spent, and a healthy one still renders.

import { describe, expect, it, vi, beforeEach } from "vitest";

const spendCredits = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const getRenderRuntimeHealth = vi.hoisted(() => vi.fn());
const loggerError = vi.hoisted(() => vi.fn());
const projectUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(async () => ({ userId: "user-1" })),
  getUserTier: vi.fn(async () => "free"),
}));
vi.mock("@/lib/plans/tiers", () => ({ tierPriority: () => 1 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findFirst: vi.fn(async () => ({
        id: "p1",
        userId: "user-1",
        status: "draft",
        editorDoc: {
          version: 1, aspect: "9:16", fps: 30,
          tracks: {
            video: [{ id: "c1", type: "video", assetId: "a1", timelineStart: 0, duration: 4, srcIn: 0, volume: 1, muted: false }],
            text: [], audio: [], image: [], caption: [],
          },
        },
      })),
      update: projectUpdate,
    },
    asset: { findMany: vi.fn(async () => [{ id: "a1", userId: "user-1", s3Key: "k1" }]) },
  },
}));
vi.mock("@/lib/redis", () => ({ redis: { get: vi.fn(async () => null) } }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/render-queue", () => ({ createRenderQueue: () => ({ enqueue }) }));
vi.mock("@/utils/s3-upload", () => ({ getAssetReadUrl: vi.fn(async () => "https://example.invalid/a1.mp4") }));
vi.mock("@/lib/credits", () => ({ spendCredits }));
vi.mock("@/utils/ffmpeg-render", () => ({ ffmpegBin: "/fake/ffmpeg" }));
vi.mock("@/lib/logger", () => ({ logger: { error: loggerError, info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/editor/render-job", () => ({ editorRenderJob: vi.fn(), EDITOR_RENDER_CREDIT_COST: 1 }));
vi.mock("@/lib/render-runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/render-runtime")>("@/lib/render-runtime");
  return { ...actual, getRenderRuntimeHealth };
});

const { POST } = await import("./route");

const request = () =>
  ({ json: async () => ({ projectId: "p1" }) }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  vi.clearAllMocks();
  spendCredits.mockResolvedValue({ ok: true, balances: { total: 41 } });
});

describe("runtime capability gate", () => {
  it("refuses the export WITHOUT spending a credit when drawtext is missing", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: false, binaryPath: "/fake/ffmpeg", version: "ffmpeg version 7.0.2-static",
      spawnError: null, missingFilters: ["drawtext"], missingEncoders: [], totalFilters: 486,
    });

    const res = await POST(request());
    expect(res.status).toBe(503);

    // The whole point: no charge, no queue entry, no status flip.
    expect(spendCredits).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(projectUpdate).not.toHaveBeenCalled();
  });

  it("returns a sanitized message — no ffmpeg/filter/binary detail reaches the user", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: false, binaryPath: "/srv/app/vendor/ffmpeg/ffmpeg", version: "ffmpeg version 7.0.2-static",
      spawnError: null, missingFilters: ["drawtext"], missingEncoders: [], totalFilters: 486,
    });

    const body = await (await POST(request())).json();
    expect(body.message).toBe("Video export is temporarily unavailable. Please try again shortly.");
    expect(body.error).toBe("RENDER_RUNTIME_UNHEALTHY");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/drawtext|ffmpeg|vendor|libx264|7\.0\.2/i);
  });

  it("logs the exact missing capabilities internally for diagnosis", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: false, binaryPath: "/fake/ffmpeg", version: "ffmpeg version 7.0.2-static",
      spawnError: null, missingFilters: ["drawtext"], missingEncoders: ["aac"], totalFilters: 486,
    });

    await POST(request());
    expect(loggerError).toHaveBeenCalledTimes(1);
    const meta = loggerError.mock.calls[0][2];
    expect(meta.code).toBe("RENDER_RUNTIME_UNHEALTHY");
    expect(meta.missingFilters).toEqual(["drawtext"]);
    expect(meta.missingEncoders).toEqual(["aac"]);
    expect(meta.version).toBe("ffmpeg version 7.0.2-static");
    expect(meta.projectId).toBe("p1");
  });

  it("also refuses when a missing ENCODER is the gap, not a filter", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: false, binaryPath: "/fake/ffmpeg", version: "v", spawnError: null,
      missingFilters: [], missingEncoders: ["libx264"], totalFilters: 486,
    });
    expect((await POST(request())).status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("also refuses when the binary cannot be executed at all", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: false, binaryPath: "/fake/ffmpeg", version: null, spawnError: "spawn ENOENT",
      missingFilters: ["drawtext"], missingEncoders: ["libx264", "aac"], totalFilters: 0,
    });
    expect((await POST(request())).status).toBe(503);
    expect(spendCredits).not.toHaveBeenCalled();
  });

  it("permits the render when the runtime is healthy", async () => {
    getRenderRuntimeHealth.mockResolvedValue({
      ok: true, binaryPath: "/fake/ffmpeg", version: "ffmpeg version 6.0-static",
      spawnError: null, missingFilters: [], missingEncoders: [], totalFilters: 486,
    });

    const res = await POST(request());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ status: "rendering" });
    expect(spendCredits).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
