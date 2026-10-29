// Starting a Caption Studio project from a video in Assets.

import { describe, expect, it, vi, beforeEach } from "vitest";

const assetFindFirst = vi.hoisted(() => vi.fn());
const presetFindFirst = vi.hoisted(() => vi.fn(async () => null));
const projectCreate = vi.hoisted(() => vi.fn(async () => ({ id: "p1" })));

vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/dashboard-summary-cache", () => ({ invalidateDashboardSummary: vi.fn(async () => {}) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    asset: { findFirst: assetFindFirst },
    userCaptionTemplate: { findFirst: presetFindFirst },
    project: { create: projectCreate },
  },
}));

const { POST } = await import("./route");

const req = (body: unknown) =>
  ({ json: async () => body, url: "http://localhost/api/captions/projects", method: "POST" }) as unknown as Parameters<typeof POST>[0];

const video = (o: Record<string, unknown> = {}) => ({ id: "a1", name: "founder_story.mp4", kind: "video", status: "ready", duration: 161, width: 1080, height: 1920, ...o });

beforeEach(() => {
  vi.clearAllMocks();
  assetFindFirst.mockResolvedValue(video());
  presetFindFirst.mockResolvedValue(null);
});

describe("POST /api/captions/projects", () => {
  it("creates a captions project around the whole video", async () => {
    const res = await POST(req({ assetId: "a1", aspect: "original", language: "hi", removeFillers: false }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ projectId: "p1" });
    const data = projectCreate.mock.calls[0]![0].data;
    expect(data).toMatchObject({ userId: "u1", title: "founder_story", productType: "captions", sourceAssetId: "a1" });
    expect(data.editorDoc).toMatchObject({ aspect: "original", size: { w: 1080, h: 1920 } });
    expect(data.editorDoc.tracks.video[0]).toMatchObject({ assetId: "a1", duration: 161 });
    expect(data.subtitlesStyle).toEqual({ templateId: "clean", language: "hi", removeFillers: false });
  });

  it("starts from the user's default saved look", async () => {
    presetFindFirst.mockResolvedValue({ baseTemplateId: "boardroom", style: { accent: "#C8FF55" } } as never);
    await POST(req({ assetId: "a1", aspect: "9:16" }));
    const data = projectCreate.mock.calls[0]![0].data;
    expect(data.editorDoc.captionStyle).toEqual({ accent: "#C8FF55" });
    expect(data.subtitlesStyle.templateId).toBe("boardroom");
  });

  it("uses the browser's reading when the asset has no size or length", async () => {
    assetFindFirst.mockResolvedValue(video({ width: null, height: null, duration: null }));
    await POST(req({ assetId: "a1", aspect: "original", videoSize: { w: 1920, h: 1080 }, durationSec: 30 }));
    const doc = projectCreate.mock.calls[0]![0].data.editorDoc;
    expect(doc.size).toEqual({ w: 1920, h: 1080 });
    expect(doc.tracks.video[0].duration).toBe(30);
  });

  it("refuses original with no size anywhere, and a video with no length", async () => {
    assetFindFirst.mockResolvedValue(video({ width: null, height: null }));
    expect((await POST(req({ assetId: "a1", aspect: "original" }))).status).toBe(400);
    assetFindFirst.mockResolvedValue(video({ duration: null }));
    expect((await POST(req({ assetId: "a1", aspect: "9:16" }))).status).toBe(400);
    expect(projectCreate).not.toHaveBeenCalled();
  });

  it("only starts from the caller's own ready video", async () => {
    assetFindFirst.mockResolvedValue(null);
    expect((await POST(req({ assetId: "a1", aspect: "9:16" }))).status).toBe(404);
    expect(assetFindFirst.mock.calls[0]![0].where).toMatchObject({ id: "a1", userId: "u1", archivedAt: null });
    assetFindFirst.mockResolvedValue(video({ kind: "image" }));
    expect((await POST(req({ assetId: "a1", aspect: "9:16" }))).status).toBe(404);
    assetFindFirst.mockResolvedValue(video({ status: "processing" }));
    expect((await POST(req({ assetId: "a1", aspect: "9:16" }))).status).toBe(409);
  });

  it("rejects unknown shapes", async () => {
    expect((await POST(req({ assetId: "a1", aspect: "2:3" }))).status).toBe(400);
  });
});
