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
  voiceChanger: vi.fn(),
  bgRemover: vi.fn(),
  faceSwap: vi.fn(),
  subtitles: vi.fn(),
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
vi.mock("@/app/api/tools/voice-changer/route", () => ({ POST: web.voiceChanger }));
vi.mock("@/app/api/tools/background-remover/route", () => ({ POST: web.bgRemover }));
vi.mock("@/app/api/tools/face-swap/route", () => ({ POST: web.faceSwap }));
vi.mock("@/app/api/tools/subtitle-remover/route", () => ({ POST: web.subtitles }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1", email: "m@x.co", sessionId: "s1" })), convertToMobileSession: vi.fn(), verifyToken: vi.fn() }));
const assetFindFirst = vi.fn();
const cloneFindFirst = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { asset: { findFirst: assetFindFirst }, clonedVoice: { findFirst: cloneFindFirst } } }));
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
    assetFindFirst.mockResolvedValue({ name: "take3.mp3", s3Key: "uploads/u1/take3.mp3", mimeType: "audio/mpeg", size: 1000, kind: "audio" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    web.enhance.mockResolvedValue(json({ jobId: "mem-2", generationId: "g2" }, 202));
    const res = await POST(req({ type: "enhance-speech", assetId: "a2", idempotencyKey: "k-12345678" }));
    expect(await res.json()).toEqual({ jobId: "gen_g2" });
    const form = await (web.enhance.mock.calls[0]![0] as NextRequest).formData();
    const file = form.get("file") as File;
    expect([file.name, file.type, file.size, form.get("idempotencyKey")]).toEqual(["take3.mp3", "audio/mpeg", 3, "k-12345678"]);
    vi.unstubAllGlobals();
  });

  it("sends the voice changer the recording, the voice and its settings", async () => {
    assetFindFirst.mockResolvedValue({ name: "take3.mp3", s3Key: "uploads/u1/take3.mp3", mimeType: "audio/mpeg", size: 1000, kind: "audio" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
    web.voiceChanger.mockResolvedValue(json({ jobId: "mem-3", generationId: "g3" }, 202));
    const res = await POST(req({ type: "voice-changer", assetId: "a2", voiceId: "aria", removeNoise: true, speed: 1.1 }));
    expect(await res.json()).toEqual({ jobId: "gen_g3" });
    const form = await (web.voiceChanger.mock.calls[0]![0] as NextRequest).formData();
    expect([(form.get("audio") as File).name, form.get("voiceSlug"), form.get("removeNoise"), form.get("speed")]).toEqual(["take3.mp3", "aria", "true", "1.1"]);
    vi.unstubAllGlobals();
  });

  it("gives face swap both photos, the face first", async () => {
    assetFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ name: `${where.id}.jpg`, s3Key: `uploads/u1/${where.id}.jpg`, mimeType: "image/jpeg", size: 10, kind: "image" }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    web.faceSwap.mockResolvedValue(json({ jobId: "mem-4", generationId: "g4" }));
    const res = await POST(req({ type: "face-swap", faceAssetId: "me", targetAssetId: "poster", consent: true }));
    expect(await res.json()).toEqual({ jobId: "gen_g4" });
    const form = await (web.faceSwap.mock.calls[0]![0] as NextRequest).formData();
    expect([(form.get("characterImage") as File).name, (form.get("targetImage") as File).name]).toEqual(["me.jpg", "poster.jpg"]);
    vi.unstubAllGlobals();
  });

  it("refuses the wrong kind of file, and says which plan a tool needs", async () => {
    assetFindFirst.mockResolvedValue({ name: "song.mp3", s3Key: "k", mimeType: "audio/mpeg", size: 10, kind: "audio" });
    let res = await POST(req({ type: "background-remover", assetId: "a1" }));
    expect([res.status, (await res.json()).code]).toEqual([400, "wrong_kind"]);
    expect(web.bgRemover).not.toHaveBeenCalled();
    assetFindFirst.mockResolvedValue({ name: "talk.mp4", s3Key: "k", mimeType: "video/mp4", size: 10, kind: "video" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    web.subtitles.mockResolvedValue(json({ error: "Subtitle Remover requires the pro plan or higher.", requiredTier: "pro", upgradeUrl: "/pricing" }, 403));
    res = await POST(req({ type: "subtitle-remover", assetId: "v1" }));
    expect([res.status, await res.json()]).toEqual([403, { error: "Subtitle Remover requires the pro plan or higher.", code: "plan_required", requiredTier: "pro" }]);
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

describe("cloned voices", () => {
  it("speaks with the caller's own cloned voice, by its ElevenLabs id", async () => {
    cloneFindFirst.mockResolvedValueOnce({ elevenLabsVoiceId: "el_maya" });
    web.voiceover.mockResolvedValue(json({ generationId: "g1" }, 202));
    await POST(req({ type: "voiceover", text: "Hello there", voiceId: "clone:cv1" }));
    expect(cloneFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cv1", userId: "u1" } }));
    expect((await sent(web.voiceover)).voiceId).toBe("el_maya");
  });

  it("refuses someone else's cloned voice without calling the voice tool", async () => {
    cloneFindFirst.mockResolvedValueOnce(null);
    const res = await POST(req({ type: "voiceover", text: "Hello there", voiceId: "clone:theirs" }));
    expect([res.status, (await res.json()).code]).toEqual([404, "voice_not_found"]);
    expect(web.voiceover).not.toHaveBeenCalled();
  });
});
