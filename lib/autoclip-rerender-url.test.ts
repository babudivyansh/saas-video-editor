// A clip re-render reads only the bytes it needs.
//
// rerenderJob used to download the whole source before cutting one clip out
// of it: 1.1 GB per re-render of an 81-minute upload, which stalled on
// Hostinger (Sentry 2026-11-19). It now hands ffmpeg the presigned URL of an
// owned source, and ffmpeg's input seek fetches the moov atom plus the clip's
// window with Range requests. These tests run the real job against a local
// http server with Range support, with real ffmpeg, and count the bytes.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";

vi.mock("@/lib/render-queue", async () => ({
  createRenderQueue: () => ({ enqueue: async () => {}, driver: "in-process" }),
  NonRetryableError: (await import("@/lib/job-queue")).NonRetryableError,
}));
vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket", GEMINI_API_KEY: "test" },
}));
vi.mock("@/lib/redis", () => ({
  redis: { get: vi.fn(async () => null), set: vi.fn(async () => {}), del: vi.fn(async () => {}) },
}));
vi.mock("@/lib/notify", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({ sendClipsReadyEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/auth", () => ({ getUserTier: vi.fn(async () => "pro") }));

const refundFailedRerender = vi.fn(async () => {});
vi.mock("@/lib/autoclip-rerender", () => ({ refundFailedRerender, runPendingRerender: vi.fn(async () => {}) }));

// The source URL ffmpeg is given, set per test once the server is listening.
let sourceUrl = "";
vi.mock("@/lib/source-url", () => ({
  classifySource: vi.fn(async () => ({ kind: "owned", key: "uploads/user-1/src.mp4", url: sourceUrl })),
  freshSourceUrl: vi.fn(async () => sourceUrl),
}));

// The full-download fallback: a plain copy of the fixture, counted.
let fixturePath = "";
const downloadFile = vi.fn(async (_url: string, dest: string) => { fs.copyFileSync(fixturePath, dest); });
vi.mock("@/utils/download", () => ({ downloadFile: (url: string, dest: string) => downloadFile(url, dest) }));

const uploads: string[] = [];
vi.mock("@/utils/s3-upload", () => ({
  uploadFileToS3: vi.fn(async (file: string, key: string) => {
    expect(fs.statSync(file).size).toBeGreaterThan(0);
    uploads.push(key);
    return `https://test-bucket.s3.amazonaws.com/${key}`;
  }),
  getAssetReadUrl: vi.fn(async (key: string) => `https://test-bucket.s3.amazonaws.com/${key}`),
}));

let clipUpdates: Array<{ data: Record<string, unknown> }> = [];
const CLIP = {
  id: "clip-1", projectId: "project-1", index: 0, status: "queued",
  startSec: 40, endSec: 43, durationSec: 3, aspectRatio: "9:16",
  hasCaptions: false, captionStyleIndex: null, subtitleStyleOverride: null,
  cropKeyframes: null, mood: "neutral", silenceSettings: null, transcriptJson: null,
  signalTrack: null, scoreBreakdown: null, liteEdits: null, rerenderCount: 1, videoUrl: null,
  brollWindows: null, brollUrl: null, brollStartSec: null, brollEndSec: null, brollQuery: null, title: "t",
};
// An inline (legacy) face timeline, so the re-render also probes the source's
// dimensions — over the URL, not from a local copy.
const FACES = [
  { tSec: 40, x: 0.4, y: 0.3, w: 0.2, h: 0.3, confidence: 0.99 },
  { tSec: 42, x: 0.45, y: 0.3, w: 0.2, h: 0.3, confidence: 0.99 },
];
let faceTimeline: typeof FACES | null = FACES;
vi.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: vi.fn(async () => null) },
    project: {
      findUnique: vi.fn(async () => ({
        id: "project-1", userId: "user-1", videoUrl: null, faceTimeline,
        uploadedVideoUrl: "https://test-bucket.s3.amazonaws.com/uploads/user-1/src.mp4",
      })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    clip: {
      findUnique: vi.fn(async () => ({ ...CLIP })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => { clipUpdates.push(args); return { ...CLIP, ...args.data }; }),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    asset: {
      findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: "a" })),
      upsert: vi.fn(async () => ({ id: "a" })), update: vi.fn(async () => ({})),
    },
    user: { findUnique: vi.fn(async () => ({ email: "a@b.co", name: "A" })) },
  },
}));

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}
const FFMPEG = ffmpegBin();
const withFfmpeg = FFMPEG ? describe : describe.skip;

withFfmpeg("rerenderJob — reads the source over http, not a full download", () => {
  let dir = "";
  let server: http.Server;
  let bytesServed = 0;
  let refuse = false;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rerender-url-"));
    fixturePath = path.join(dir, "src.mp4");
    // 120 s of noisy video at a fixed high bitrate (~90 MB), so the clip's
    // 3 s window is a small, measurable fraction of the file. Big enough that
    // the fixed cost of each ffmpeg open (it probes ~5 MB of stream data,
    // more with Linux's larger socket buffers) stays a minor share: on a
    // 22 MB fixture the probe + render opens alone were 40%. The default mp4
    // muxer puts the moov atom at the END, as phone uploads have it.
    const made = spawnSync(FFMPEG!, [
      "-hide_banner", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=120,noise=alls=60:allf=t",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=120",
      "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "6M", "-minrate", "6M", "-maxrate", "6M", "-bufsize", "6M", "-g", "60",
      "-c:a", "aac", "-shortest", fixturePath,
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    expect(made.status, made.stderr).toBe(0);

    server = http.createServer((req, res) => {
      if (refuse) { res.writeHead(403); res.end("AccessDenied"); return; }
      const size = fs.statSync(fixturePath).size;
      const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
      const start = m ? Number(m[1]) : 0;
      const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
      if (start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); res.end(); return; }
      res.writeHead(m ? 206 : 200, {
        "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Content-Length": end - start + 1,
        ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
      });
      if (req.method === "HEAD") { res.end(); return; }
      const stream = fs.createReadStream(fixturePath, { start, end });
      stream.on("data", (c) => { bytesServed += c.length; });
      // ffmpeg closes a connection mid-body when it seeks; that is normal.
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    // The query string stands in for a presigned URL's signature.
    sourceUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/src.mp4?X-Amz-Signature=deadbeef`;
  }, 120_000);

  afterAll(async () => {
    await new Promise<void>((r) => server?.close(() => r()));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    bytesServed = 0;
    refuse = false;
    clipUpdates = [];
    uploads.length = 0;
    faceTimeline = FACES;
    downloadFile.mockClear();
    refundFailedRerender.mockClear();
  });

  it("renders the clip from a fraction of the source's bytes, with no download", async () => {
    const { rerenderJob } = await import("./autoclip-pipeline");
    await rerenderJob({ projectId: "project-1", clipId: "clip-1" });

    expect(clipUpdates.some((u) => u.data.status === "ready"), JSON.stringify(clipUpdates)).toBe(true);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(refundFailedRerender).not.toHaveBeenCalled();
    expect(uploads.some((k) => k.endsWith(".mp4"))).toBe(true);
    // Face tracking ran against the URL-probed dimensions.
    expect(clipUpdates.some((u) => u.data.cropKeyframes && typeof u.data.cropKeyframes === "object")).toBe(true);

    const size = fs.statSync(fixturePath).size;
    // A 3 s window of a 120 s file is 2.5%, plus the moov atom, a keyframe
    // of lead-in and each open's probe reads. A full read would be 100%.
    expect(bytesServed).toBeGreaterThan(0);
    if (process.env.RERENDER_URL_DEBUG) process.stderr.write(`served ${bytesServed} of ${size}
`);
    expect(bytesServed / size).toBeLessThan(0.25);
  }, 120_000);

  it("switches to a full download, before computing the crop, when the URL can't be probed", async () => {
    refuse = true;
    const { rerenderJob } = await import("./autoclip-pipeline");
    await rerenderJob({ projectId: "project-1", clipId: "clip-1" });

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(clipUpdates.some((u) => u.data.status === "ready"), JSON.stringify(clipUpdates)).toBe(true);
    expect(refundFailedRerender).not.toHaveBeenCalled();
    // The crop was computed from the real frame size, not a failed probe's 0x0.
    const crop = clipUpdates.find((u) => u.data.cropKeyframes && typeof u.data.cropKeyframes === "object");
    expect(JSON.stringify(crop?.data.cropKeyframes)).not.toMatch(/NaN|null/);
  }, 120_000);

  it("falls back to a full download when the render's http read is refused, and never logs the signature", async () => {
    faceTimeline = null; // no probe first: the render itself meets the 403
    refuse = true;
    const { logger } = await import("./logger");
    const warn = vi.spyOn(logger, "warn");
    const { rerenderJob } = await import("./autoclip-pipeline");
    await rerenderJob({ projectId: "project-1", clipId: "clip-1" });

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(clipUpdates.some((u) => u.data.status === "ready"), JSON.stringify(clipUpdates)).toBe(true);
    expect(refundFailedRerender).not.toHaveBeenCalled();
    const fallbackLog = warn.mock.calls.find((c) => /downloading the whole source/.test(String(c[1])));
    expect(fallbackLog).toBeTruthy();
    const logged = String((fallbackLog![2] as Error).message);
    expect(logged).toMatch(/403/);
    expect(logged).not.toMatch(/deadbeef/);
    warn.mockRestore();
  }, 120_000);
});
