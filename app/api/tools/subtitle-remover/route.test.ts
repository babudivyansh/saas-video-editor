import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Route-level tests for the Subtitle Remover's three modes: what gets charged,
// what ffmpeg is asked to do, and that every way of producing nothing refunds.

const env: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({ env }));
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/with-rate-limit", () => ({ withRateLimit: (h: unknown) => h }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/upload-policy", () => ({
  resolveUploadPolicy: vi.fn(async () => ({})),
  readUploadForm: vi.fn(async (req: NextRequest) => req.formData()),
  assertWithinUploadPolicy: vi.fn(),
  UploadPolicyError: class extends Error {},
  uploadPolicyErrorBody: vi.fn(),
  uploadPolicyErrorStatus: vi.fn(),
}));

const credits = {
  chargeCredits: vi.fn(async (_a: { amount: number }) => ({ ok: true as const, generationId: "g1", replay: false })),
  refundCredits: vi.fn(async () => undefined),
  markGenerationStatus: vi.fn(async () => undefined),
  updateGenerationProgress: vi.fn(async () => undefined),
  checkModelAccess: vi.fn(async () => ({ allowed: true })),
};
vi.mock("@/lib/credits", () => credits);

let durationSec = 30;
vi.mock("@/lib/media-upload", () => ({
  saveMediaUpload: vi.fn(async () => ({ inputPath: "/tmp/in.mp4", durationSec })),
}));

// A 1920x1080 PNG header for every frame the route reads.
function png(w: number, h: number) {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
const fsStub = {
  readFileSync: vi.fn(() => png(1920, 1080)),
  readdirSync: vi.fn(() => [] as string[]),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1000 })),
  existsSync: vi.fn(() => true),
  createWriteStream: vi.fn(),
};
vi.mock("fs", () => ({ default: fsStub, ...fsStub }));
vi.mock("stream/promises", () => ({ pipeline: vi.fn(async () => undefined) }));

const ffmpeg = {
  runFFmpegArgs: vi.fn(async () => undefined),
  runFFmpegWithProgress: vi.fn(async () => undefined),
  probeVideoStream: vi.fn(async () => ({ codec: "h264", pixFmt: "yuv420p", rotated: false, hasAudio: true })),
};
vi.mock("@/utils/ffmpeg-render", async (orig) => ({ ...(await orig<typeof import("@/utils/ffmpeg-render")>()), ...ffmpeg }));

const s3 = {
  uploadFileToS3: vi.fn(async () => "https://bucket/x"),
  getPresignedUrl: vi.fn(async () => "https://bucket/x?sig"),
  deleteS3Object: vi.fn(async () => undefined),
};
vi.mock("@/utils/s3-upload", () => s3);

const ocrBoxes: Array<{ x: number; y: number; w: number; h: number }> = [];
vi.mock("@fal-ai/client", () => ({
  fal: {
    config: vi.fn(),
    storage: { upload: vi.fn(async () => "https://fal/frame.png") },
    subscribe: vi.fn(async () => ({ data: { results: { quad_boxes: ocrBoxes } } })),
  },
}));

const piapi = {
  createRemoveSubtitleTask: vi.fn(async () => ({ taskId: "t1", status: "pending", videoUrl: null, errorMessage: null })),
  waitForTask: vi.fn(async () => "https://img.theapi.app/out.mp4"),
};
vi.mock("@/lib/subtitle-remover/piapi", async (orig) => ({ ...(await orig<typeof import("@/lib/subtitle-remover/piapi")>()), ...piapi }));

const saveToolResult = vi.fn(async () => undefined);
vi.mock("@/lib/tool-results", () => ({ saveToolResult: (...a: unknown[]) => saveToolResult(...(a as [])) }));

function request(fields: Record<string, string>) {
  const form = new FormData();
  form.append("video", new File([new Uint8Array(10)], "v.mp4", { type: "video/mp4" }));
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequest("http://localhost/api/tools/subtitle-remover", { method: "POST", body: form });
}

async function load() {
  return import("./route");
}

const settled = () => vi.waitFor(() => {
  const calls = credits.markGenerationStatus.mock.calls.length + credits.refundCredits.mock.calls.length;
  if (calls === 0) throw new Error("job still running");
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(env)) delete env[k];
  env.FAL_KEY = "fal";
  durationSec = 30;
  ocrBoxes.length = 0;
  fsStub.readdirSync.mockReturnValue([]);
  (globalThis as { __subtitleRemoverJobs?: Map<string, unknown> }).__subtitleRemoverJobs?.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("mode checks before charging", () => {
  it("refuses AI erase when PiAPI isn't configured", async () => {
    const { POST } = await load();
    const res = await POST(request({ area: "auto" }));
    expect(res.status).toBe(503);
    expect(credits.chargeCredits).not.toHaveBeenCalled();
  });

  it("refuses bottom mode without fal, but marked-area mode still works", async () => {
    delete env.FAL_KEY;
    const { POST } = await load();
    expect((await POST(request({ area: "bottom" }))).status).toBe(503);
    const res = await POST(request({ area: "region", regions: JSON.stringify([{ x: 0, y: 0.8, w: 1, h: 0.15 }]) }));
    expect(res.status).toBe(202);
  });

  it("refuses marked-area mode with no valid boxes", async () => {
    const { POST } = await load();
    const res = await POST(request({ area: "region", regions: "[]" }));
    expect(res.status).toBe(400);
    expect(credits.chargeCredits).not.toHaveBeenCalled();
  });

  it("refuses more than three jobs at once", async () => {
    ffmpeg.runFFmpegWithProgress.mockImplementation(() => new Promise(() => { /* never ends */ }));
    const { POST } = await load();
    const regions = JSON.stringify([{ x: 0, y: 0.8, w: 1, h: 0.15 }]);
    for (let i = 0; i < 3; i++) expect((await POST(request({ area: "region", regions }))).status).toBe(202);
    expect((await POST(request({ area: "region", regions }))).status).toBe(429);
    ffmpeg.runFFmpegWithProgress.mockImplementation(async () => undefined);
  });
});

describe("marked-area mode", () => {
  it("charges 1 credit a minute and patches the boxes with a single-threaded encode", async () => {
    durationSec = 90;
    const { POST } = await load();
    const res = await POST(request({ area: "region", regions: JSON.stringify([{ x: 0, y: 0.9, w: 1, h: 0.1 }]) }));
    expect(res.status).toBe(202);
    await settled();
    expect(credits.chargeCredits.mock.calls[0][0].amount).toBe(2);
    const args = ffmpeg.runFFmpegWithProgress.mock.calls[0][0] as string[];
    expect(args[args.indexOf("-vf") + 1]).toBe("delogo=x=1:y=972:w=1918:h=107:show=0");
    expect(args.slice(args.indexOf("-threads"), args.indexOf("-threads") + 2)).toEqual(["-threads", "1"]);
    expect(saveToolResult).toHaveBeenCalled();
    expect(credits.markGenerationStatus).toHaveBeenCalledWith("g1", "completed");
    expect(credits.refundCredits).not.toHaveBeenCalled();
  });
});

describe("bottom-third mode", () => {
  it("finds nothing: refunds, and neither encodes nor saves a copy", async () => {
    fsStub.readdirSync.mockReturnValue(["frame-0001.png", "frame-0002.png"]);
    const { POST } = await load();
    expect((await POST(request({}))).status).toBe(202);
    await settled();
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(ffmpeg.runFFmpegWithProgress).not.toHaveBeenCalled();
    expect(saveToolResult).not.toHaveBeenCalled();
    expect(credits.markGenerationStatus).toHaveBeenCalledWith("g1", "failed", expect.stringMatching(/No captions/));
  });

  it("patches captions found at the very edge without breaking delogo", async () => {
    fsStub.readdirSync.mockReturnValue(["frame-0001.png", "frame-0002.png"]);
    ocrBoxes.push({ x: 0, y: 1030, w: 1920, h: 50 });
    const { POST } = await load();
    await POST(request({}));
    await settled();
    const args = ffmpeg.runFFmpegWithProgress.mock.calls[0][0] as string[];
    const m = /delogo=x=(\d+):y=(\d+):w=(\d+):h=(\d+)/.exec(args[args.indexOf("-vf") + 1])!;
    const [x, y, w, h] = m.slice(1).map(Number);
    expect(x).toBeGreaterThanOrEqual(1);
    expect(x + w).toBeLessThanOrEqual(1919);
    expect(y + h).toBeLessThanOrEqual(1079);
    expect(credits.markGenerationStatus).toHaveBeenCalledWith("g1", "completed");
  });

  it("an OCR outage refunds instead of charging for an unchanged video", async () => {
    fsStub.readdirSync.mockReturnValue(["frame-0001.png", "frame-0002.png"]);
    const { fal } = await import("@fal-ai/client");
    vi.mocked(fal.subscribe).mockRejectedValue(new Error("User is locked"));
    const { POST } = await load();
    await POST(request({}));
    await settled();
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(credits.markGenerationStatus).toHaveBeenCalledWith("g1", "failed", expect.any(String));
  });
});

describe("AI erase mode", () => {
  beforeEach(() => {
    env.PIAPI_API_KEY = "pi";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(8), { status: 200 })));
  });

  it("charges 1 credit per 4 s, sends a presigned URL, puts the audio back and deletes the S3 copy", async () => {
    durationSec = 40;
    const { POST } = await load();
    expect((await POST(request({ area: "auto" }))).status).toBe(202);
    await vi.waitFor(() => expect(credits.markGenerationStatus).toHaveBeenCalledWith("g1", "completed"));
    expect(credits.chargeCredits.mock.calls[0][0].amount).toBe(10);
    expect(piapi.createRemoveSubtitleTask).toHaveBeenCalledWith("pi", "https://bucket/x?sig");
    const mux = ffmpeg.runFFmpegArgs.mock.calls.map((c) => c[0] as string[]).find((a) => a.includes("1:a:0?"))!;
    expect(mux).toEqual(expect.arrayContaining(["-c:v", "copy"]));
    expect(s3.deleteS3Object).toHaveBeenCalledWith(expect.stringMatching(/^tool-inputs\/subtitle-remover\/u1\//));
    expect(saveToolResult).toHaveBeenCalled();
  });

  it("refunds and still deletes the S3 copy when PiAPI fails", async () => {
    piapi.waitForTask.mockRejectedValueOnce(new Error("PiAPI task failed"));
    const { POST } = await load();
    await POST(request({ area: "auto" }));
    await settled();
    expect(credits.refundCredits).toHaveBeenCalledTimes(1);
    expect(s3.deleteS3Object).toHaveBeenCalled();
    expect(saveToolResult).not.toHaveBeenCalled();
  });

  it("re-encodes rotated phone video before sending it", async () => {
    ffmpeg.probeVideoStream.mockResolvedValueOnce({ codec: "h264", pixFmt: "yuv420p", rotated: true, hasAudio: true });
    const { POST } = await load();
    await POST(request({ area: "auto" }));
    await settled();
    const first = ffmpeg.runFFmpegArgs.mock.calls[0][0] as string[];
    expect(first).toEqual(expect.arrayContaining(["-c:v", "libx264", "-an"]));
  });
});
