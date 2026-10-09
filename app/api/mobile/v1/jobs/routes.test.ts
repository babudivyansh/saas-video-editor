import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// POST /jobs runs the web's own routes; those are stand-ins here. What's
// tested: the AutoClip three-step hand-off and its clean-up, the settings
// translation, tool jobs tracked by their Generation, and the audio tools
// fed the user's own asset.

const web = {
  createProject: vi.fn(),
  patchProject: vi.fn(),
  deleteProject: vi.fn(async () => NextResponse.json({ success: true })),
  importUrl: vi.fn(),
  autoClip: vi.fn(),
  render: vi.fn(),
  image: vi.fn(),
  voiceover: vi.fn(),
  enhance: vi.fn(),
  vocal: vi.fn(),
};
vi.mock("@/app/api/projects/route", () => ({ POST: web.createProject }));
vi.mock("@/app/api/projects/[id]/route", () => ({ PATCH: web.patchProject, DELETE: web.deleteProject }));
vi.mock("@/app/api/projects/[id]/import-url/route", () => ({ POST: web.importUrl }));
vi.mock("@/app/api/generate/auto-clip/route", () => ({ POST: web.autoClip }));
vi.mock("@/app/api/editor/render/route", () => ({ POST: web.render }));
vi.mock("@/app/api/tools/image-generator/route", () => ({ POST: web.image }));
vi.mock("@/app/api/tools/voiceover/route", () => ({ POST: web.voiceover }));
vi.mock("@/app/api/tools/enhance-speech/route", () => ({ POST: web.enhance }));
vi.mock("@/app/api/tools/vocal-remover/route", () => ({ POST: web.vocal }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
const assetFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findFirst: assetFindFirst } } }));
vi.mock("@/utils/s3-upload", () => ({ getPresignedUrl: vi.fn(async () => "https://s3/signed") }));
vi.mock("@/lib/signed-media", () => ({ resignMediaUrl: vi.fn() }));

const { POST } = await import("./route");

const req = (body: unknown) =>
  new NextRequest("http://localhost/api/mobile/v1/jobs", { method: "POST", headers: { authorization: "Bearer acc", "content-type": "application/json" }, body: JSON.stringify(body) });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const sent = async (m: ReturnType<typeof vi.fn>) => (m.mock.calls[0]![0] as NextRequest).json();
const settings = { clipLength: "short", clipCount: 6, aspectRatio: "9:16", captionTemplateId: null };

beforeEach(() => {
  vi.clearAllMocks();
  web.createProject.mockResolvedValue(json({ project: { id: "p1" } }, 201));
  web.patchProject.mockResolvedValue(json({ project: {} }));
  web.importUrl.mockResolvedValue(json({ ok: true }));
  web.autoClip.mockResolvedValue(json({ status: "queued" }));
});

describe("autoclip", () => {
  it("creates the project, attaches the asset and starts the run with the app's settings", async () => {
    assetFindFirst.mockResolvedValue({ name: "Ep42-master.mp4", url: "https://b.s3.amazonaws.com/uploads/u1/ep42.mp4" });
    const res = await POST(req({ type: "autoclip", source: { kind: "asset", assetId: "a1" }, settings }));
    expect([res.status, await res.json()]).toEqual([202, { jobId: "run_p1" }]);
    expect(await sent(web.createProject)).toEqual({ title: "Ep42-master.mp4", productType: "auto-clip" });
    expect(await sent(web.patchProject)).toEqual({ uploadedVideoUrl: "https://b.s3.amazonaws.com/uploads/u1/ep42.mp4" });
    expect(await sent(web.autoClip)).toMatchObject({ projectId: "p1", minDuration: 5, maxDuration: 30, clipCount: 6, captionTemplateId: null, reframingPreset: "balanced", allowCreditOverflow: false });
    expect(assetFindFirst.mock.calls[0]![0].where).toMatchObject({ id: "a1", userId: "u1", kind: "video", archivedAt: null });
  });

  it("imports a link, and removes the project if the run is refused", async () => {
    web.autoClip.mockResolvedValue(json({ error: "Not enough Clip Minutes (need 45, have 30)" }, 402));
    const res = await POST(req({ type: "autoclip", source: { kind: "link", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, settings }));
    expect([res.status, (await res.json()).error]).toEqual([402, "Not enough Clip Minutes (need 45, have 30)"]);
    expect(await sent(web.importUrl)).toEqual({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(web.deleteProject).toHaveBeenCalledOnce();
  });

  it("turns the web's insufficient-minutes refusal into a sentence, a code and the numbers", async () => {
    assetFindFirst.mockResolvedValue({ name: "Ep42.mp4", url: "https://b.s3.amazonaws.com/uploads/u1/ep42.mp4" });
    web.autoClip.mockResolvedValue(json({ error: "insufficient_minutes", required: 45, balance: 30, overflowCredits: 5 }, 402));
    const res = await POST(req({ type: "autoclip", source: { kind: "asset", assetId: "a1" }, settings }));
    expect([res.status, await res.json()]).toEqual([
      402,
      { error: "This video needs 45 Clip Minutes and you have 30.", code: "insufficient_minutes", required: 45, balance: 30, overflowCredits: 5 },
    ]);
    expect(web.deleteProject).toHaveBeenCalledOnce();
  });

  it("refuses someone else's (or a missing) video before creating anything", async () => {
    assetFindFirst.mockResolvedValue(null);
    expect((await POST(req({ type: "autoclip", source: { kind: "asset", assetId: "theirs" }, settings }))).status).toBe(404);
    expect(web.createProject).not.toHaveBeenCalled();
  });

  it("refuses links the app doesn't accept", async () => {
    expect((await POST(req({ type: "autoclip", source: { kind: "link", url: "https://evil.example/v.mp4" }, settings }))).status).toBe(400);
  });
});

describe("tools and export", () => {
  it("tracks an AI image by the Generation the web route charged", async () => {
    web.image.mockResolvedValue(json({ jobId: "mem-1", generationId: "g1" }, 202));
    const res = await POST(req({ type: "ai-image", prompt: "neon city at night", modelId: "seedream-5.0", ratio: "9:16" }));
    expect(await res.json()).toEqual({ jobId: "gen_g1" });
    expect(await sent(web.image)).toEqual({ prompt: "neon city at night", model: "seedream-5.0", ratio: "9:16" });
  });

  it("passes the web's refusal through (credits, plan)", async () => {
    web.voiceover.mockResolvedValue(json({ error: "Insufficient credits (need 2)" }, 402));
    const res = await POST(req({ type: "voiceover", text: "Hello there", voiceId: "brian" }));
    expect([res.status, (await res.json()).error]).toEqual([402, "Insufficient credits (need 2)"]);
  });

  it("feeds an audio tool the caller's own asset as a file", async () => {
    assetFindFirst.mockResolvedValue({ name: "take3.mp3", s3Key: "uploads/u1/take3.mp3", mimeType: "audio/mpeg", size: 1000 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    web.enhance.mockResolvedValue(json({ jobId: "mem-2", generationId: "g2" }, 202));
    const res = await POST(req({ type: "enhance-speech", assetId: "a2", idempotencyKey: "k-12345678" }));
    expect(await res.json()).toEqual({ jobId: "gen_g2" });
    const form = await (web.enhance.mock.calls[0]![0] as NextRequest).formData();
    const file = form.get("file") as File;
    expect([file.name, file.type, file.size, form.get("idempotencyKey")]).toEqual(["take3.mp3", "audio/mpeg", 3, "k-12345678"]);
    vi.unstubAllGlobals();
  });

  it("starts an export and tracks it by its project", async () => {
    web.render.mockResolvedValue(json({ jobId: "p9-x" }));
    expect(await (await POST(req({ type: "export", projectId: "p9" }))).json()).toEqual({ jobId: "exp_p9" });
  });

  it("says an export's credit shortfall in words, and flags one already rendering", async () => {
    web.render.mockResolvedValue(json({ error: "insufficient_credits", required: 1, balance: 0 }, 402));
    let res = await POST(req({ type: "export", projectId: "p9" }));
    expect([res.status, await res.json()]).toEqual([402, { error: "Exporting needs 1 AI credit and you have 0.", code: "insufficient_credits", required: 1, balance: 0 }]);
    web.render.mockResolvedValue(json({ error: "Project is already rendering" }, 409));
    res = await POST(req({ type: "export", projectId: "p9" }));
    expect([res.status, await res.json()]).toEqual([409, { error: "This video is already exporting.", code: "already_rendering" }]);
  });
});
