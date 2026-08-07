// Execution-level render tests: these actually RUN the generated filtergraph
// through the bundled ffmpeg binary instead of asserting on the filter string.
//
// This file exists because of a specific bug class. lib/reframe.test.ts asserts
// the SHAPE of the expressions, and passed happily for months while every zoom
// in the product was inert: crop evaluates its w/h expressions once at
// configuration time (where `t` is not defined), so the nested-if zoom
// expression silently froze at one branch and never moved. A string assertion
// can never catch that — only running ffmpeg can. Any future change to the
// pan/zoom chain must keep these green.

import { describe, expect, it, vi } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("@/lib/env", () => ({
  env: { AWS_REGION: "us-east-1", AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test", AWS_S3_BUCKET: "test-bucket" },
}));

import {
  buildDynamicCropFilter, buildZoomEnvelope, computeCropKeyframesForClip,
  TARGET_RES, type CropKeyframe, type FaceBox,
} from "./reframe";
import { buildBrollFilterComplex, buildMultiBrollFilterComplex } from "./autoclip-pipeline";

function ffmpegBin(): string | null {
  const bin = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const local = path.join(process.cwd(), "node_modules", "ffmpeg-static", bin);
  return fs.existsSync(local) ? local : null;
}

const FFMPEG = ffmpegBin();
// Skip rather than fail where the binary isn't installed (e.g. a docs-only CI
// job that runs `npm ci --omit=optional`), so this can't become a flaky gate.
const d = FFMPEG ? describe : describe.skip;

// A STATIC horizontal gradient. Nothing in the source changes over time, so any
// frame-to-frame difference in the output is caused solely by our filter chain
// moving the viewport — which is exactly what we want to measure.
const STATIC_GRADIENT = "nullsrc=s=640x360:r=30:d=1,format=gray,geq=lum='X/W*255'";

function run(args: string[]): { code: number; stderr: string } {
  const res = spawnSync(FFMPEG!, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return { code: res.status ?? -1, stderr: res.stderr ?? "" };
}

/**
 * Runs `filter` over the static gradient and returns the mean luma of the
 * per-frame DIFFERENCE between consecutive output frames. All-zero means the
 * output is a still image — i.e. the viewport never moved.
 */
function frameDeltas(filter: string): number[] {
  const { code, stderr } = run([
    "-hide_banner", "-f", "lavfi", "-i", STATIC_GRADIENT,
    "-vf", `${filter},tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
    "-f", "null", "-",
  ]);
  expect(code, `ffmpeg failed:\n${stderr.slice(-2000)}`).toBe(0);
  return [...stderr.matchAll(/lavfi\.signalstats\.YAVG=([\d.]+)/g)].map((m) => parseFloat(m[1]));
}

function outputDimensions(filter: string): { w: number; h: number } {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reframe-")), "frame.png");
  try {
    const { code, stderr } = run([
      "-hide_banner", "-y", "-f", "lavfi", "-i", STATIC_GRADIENT,
      "-vf", filter, "-frames:v", "1", out,
    ]);
    expect(code, `ffmpeg failed:\n${stderr.slice(-2000)}`).toBe(0);
    const probe = run(["-hide_banner", "-i", out]);
    const m = /Video:.*?\s(\d{2,5})x(\d{2,5})/.exec(probe.stderr);
    expect(m, `could not probe output dimensions from:\n${probe.stderr.slice(-1000)}`).not.toBeNull();
    return { w: parseInt(m![1], 10), h: parseInt(m![2], 10) };
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
}

// Regression for a production incident: a pick failed permanently with
// "Video is too short (0.0s)" when the real cause was that the duration probe
// could not read the file at all. getMediaDurationSec collapses every failure
// to 0, and the caller read that 0 as a real duration — blaming the user's
// upload for our own problem, and marking it non-retryable.
d("probeMediaDuration — tells 'unreadable' apart from 'short'", () => {
  function tmpFile(name: string, contents: Buffer | string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-"));
    const p = path.join(dir, name);
    fs.writeFileSync(p, contents);
    return p;
  }

  it("reports a real duration for a readable file", async () => {
    const { probeMediaDuration } = await import("@/utils/ffmpeg-render");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-ok-"));
    const out = path.join(dir, "ok.mp4");
    try {
      const res = run(["-hide_banner", "-y", "-f", "lavfi", "-i", "testsrc=s=160x120:r=15:d=2", out]);
      expect(res.code, res.stderr.slice(-800)).toBe(0);
      const probe = await probeMediaDuration(out);
      expect(probe.durationSec).toBeGreaterThan(1.5);
      expect(probe.reason).toBe("");
      expect(probe.fileBytes).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null — not 0 — for a file it cannot decode", async () => {
    const { probeMediaDuration } = await import("@/utils/ffmpeg-render");
    const p = tmpFile("garbage.mp4", "this is definitely not a video");
    const probe = await probeMediaDuration(p);
    // The whole point: null means "couldn't read", which a caller must not
    // compare against a minimum duration.
    expect(probe.durationSec).toBeNull();
    expect(probe.reason).toMatch(/could not read|no duration/i);
    expect(probe.fileBytes).toBeGreaterThan(0);
    fs.rmSync(path.dirname(p), { recursive: true, force: true });
  });

  it("distinguishes an empty file, which is what a truncated download leaves", async () => {
    const { probeMediaDuration } = await import("@/utils/ffmpeg-render");
    const p = tmpFile("empty.mp4", "");
    const probe = await probeMediaDuration(p);
    expect(probe.durationSec).toBeNull();
    expect(probe.reason).toContain("empty");
    expect(probe.fileBytes).toBe(0);
    fs.rmSync(path.dirname(p), { recursive: true, force: true });
  });

  it("distinguishes a missing file", async () => {
    const { probeMediaDuration } = await import("@/utils/ffmpeg-render");
    const probe = await probeMediaDuration(path.join(os.tmpdir(), "does-not-exist-12345.mp4"));
    expect(probe.durationSec).toBeNull();
    expect(probe.reason).toContain("does not exist");
  });

  it("getMediaDurationSec still returns 0 for its existing callers", async () => {
    const { getMediaDurationSec } = await import("@/utils/ffmpeg-render");
    expect(await getMediaDurationSec(path.join(os.tmpdir(), "nope-98765.mp4"))).toBe(0);
  });
});

d("buildDynamicCropFilter — executed through ffmpeg", () => {
  it("renders a zoom path without erroring", () => {
    const filter = buildDynamicCropFilter(buildZoomEnvelope(1, "9:16", 640, 360), "9:16");
    const { code, stderr } = run([
      "-hide_banner", "-f", "lavfi", "-i", STATIC_GRADIENT, "-vf", filter, "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2000)).toBe(0);
  });

  it("pins the output to the target resolution when the window zooms", () => {
    expect(outputDimensions(buildDynamicCropFilter(buildZoomEnvelope(1, "9:16", 640, 360), "9:16")))
      .toEqual({ w: TARGET_RES["9:16"].w, h: TARGET_RES["9:16"].h });
  });

  // THE regression test. Before the zoompan fix this produced an identical
  // frame every time, so every delta was 0.
  it("actually moves the viewport across a zoom envelope (the frame changes)", () => {
    const deltas = frameDeltas(buildDynamicCropFilter(buildZoomEnvelope(1, "9:16", 640, 360), "9:16"));
    expect(deltas.length).toBeGreaterThan(5);
    const moved = deltas.filter((v) => v > 0.05);
    expect(moved.length, `all frame deltas were ~0 — the zoom is inert: ${deltas.slice(0, 12).join(",")}`)
      .toBeGreaterThan(deltas.length / 3);
  });

  it("actually pans across a constant-size path (the frame changes)", () => {
    const kf: CropKeyframe[] = [
      { tSec: 0, x: 0.0, y: 0, w: 0.3, h: 1 },
      { tSec: 1, x: 0.7, y: 0, w: 0.3, h: 1 },
    ];
    const deltas = frameDeltas(buildDynamicCropFilter(kf, "9:16"));
    expect(deltas.filter((v) => v > 0.05).length).toBeGreaterThan(deltas.length / 3);
  });

  it("never emits a time-varying crop w/h (ffmpeg evaluates those once, at config time)", () => {
    const filter = buildDynamicCropFilter(buildZoomEnvelope(1, "9:16", 640, 360), "9:16");
    const cropArgs = /crop=w='([^']*)':h='([^']*)'/.exec(filter);
    expect(cropArgs).not.toBeNull();
    expect(cropArgs![1]).not.toMatch(/\bt\b/);
    expect(cropArgs![2]).not.toMatch(/\bt\b/);
  });

  it("keeps a static single keyframe stable rather than drifting", () => {
    const kf: CropKeyframe[] = [{ tSec: 0, x: 0.2, y: 0, w: 0.4, h: 0.8 }];
    const deltas = frameDeltas(buildDynamicCropFilter(kf, "9:16"));
    expect(deltas.every((v) => v < 0.05)).toBe(true);
  });
});

// The tests above use hand-built keyframe paths. This block runs the path
// production actually generates — computeCropKeyframesForClip with
// smartAutoReframe on, which emits a keyframe every 0.1s and therefore a far
// larger expression than a 9-point zoom envelope.
d("production keyframe path — executed through ffmpeg", () => {
  // A face drifting left→right across a 10s clip, sampled at Rekognition's
  // rate, with the confidence the pipeline requires.
  const faces: FaceBox[] = Array.from({ length: 50 }, (_, i) => ({
    tSec: i * 0.2,
    x: 0.15 + (i / 50) * 0.5,
    y: 0.2,
    w: 0.14,
    h: 0.3,
    confidence: 95,
  }));

  it("renders the smart-reframe path without erroring", () => {
    const kf = computeCropKeyframesForClip(faces, 0, 10, "9:16", 640, 360, { smartAutoReframe: true });
    expect(kf).not.toBeNull();
    const { code, stderr } = run([
      "-hide_banner", "-f", "lavfi", "-i", STATIC_GRADIENT,
      "-vf", buildDynamicCropFilter(kf!, "9:16"), "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2000)).toBe(0);
  });

  it("moves the viewport on the smart-reframe path", () => {
    const kf = computeCropKeyframesForClip(faces, 0, 10, "9:16", 640, 360, { smartAutoReframe: true });
    const deltas = frameDeltas(buildDynamicCropFilter(kf!, "9:16"));
    expect(deltas.filter((v) => v > 0.05).length).toBeGreaterThan(deltas.length / 4);
  });

  // Guards the argv-length ceiling: every keyframe becomes one nesting level in
  // each of four expressions, and the whole graph is passed as a single command
  // line argument (Windows caps that around 32k). simplifyKeyframes bounds the
  // path at MAX_CROP_KEYFRAMES, which took this case from ~16.5k characters to
  // ~4.7k. If this trips, the fix is in the simplification, not a bigger
  // number here.
  it("keeps the generated filtergraph small enough to stay in argv", () => {
    const kf = computeCropKeyframesForClip(faces, 0, 60, "9:16", 1920, 1080, { smartAutoReframe: true });
    expect(kf!.length).toBeLessThanOrEqual(40);
    expect(buildDynamicCropFilter(kf!, "9:16").length).toBeLessThan(10_000);
  });

  // A busy, continuously-moving subject is the worst case for path length —
  // the budget must hold there too, not just on a smooth drift.
  // The B-roll graph was restructured to crop once before splitting the stream
  // (so a time-varying crop survives the per-segment setpts rebase). That is a
  // real filtergraph change — split, three trims, a concat — and worth
  // executing rather than pattern-matching.
  it("renders the B-roll splice graph, with a dynamic pan path, through ffmpeg", () => {
    const kf: CropKeyframe[] = [
      { tSec: 0, x: 0.0, y: 0, w: 0.4, h: 1 },
      { tSec: 1, x: 0.5, y: 0, w: 0.4, h: 1 },
    ];
    const complex = buildBrollFilterComplex(
      1, 0.3, 0.6, "9:16", null, null, "[0:v]", buildDynamicCropFilter(kf, "9:16"),
    );
    const { code, stderr } = run([
      "-hide_banner",
      "-f", "lavfi", "-i", STATIC_GRADIENT,
      // Stand-in for the B-roll input.
      "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=1",
      "-filter_complex", complex, "-map", "[video]", "-frames:v", "20", "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2500)).toBe(0);
  });

  // Multi-window B-roll: N inserts means 2N+1 concat segments and an N+1-way
  // split. Off-by-one errors there produce an ffmpeg error, not a wrong
  // picture, so executing it is the only assertion worth making.
  it("renders two B-roll windows in one clip", () => {
    const complex = buildMultiBrollFilterComplex(
      2,
      [{ startSec: 0.4, endSec: 0.7 }, { startSec: 1.2, endSec: 1.5 }],
      "9:16", null, null,
    );
    const { code, stderr } = run([
      "-hide_banner",
      "-f", "lavfi", "-i", "nullsrc=s=640x360:r=30:d=2,format=gray,geq=lum='X/W*255'",
      "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=1",
      "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
      "-filter_complex", complex, "-map", "[video]", "-frames:v", "30", "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2500)).toBe(0);
  });

  it("renders a B-roll window that starts at the very beginning of a clip", () => {
    // No leading main segment — the split must be sized accordingly.
    const complex = buildMultiBrollFilterComplex(2, [{ startSec: 0, endSec: 0.5 }], "9:16", null, null);
    const { code, stderr } = run([
      "-hide_banner",
      "-f", "lavfi", "-i", "nullsrc=s=640x360:r=30:d=2,format=gray,geq=lum='X/W*255'",
      "-f", "lavfi", "-i", "testsrc=s=320x180:r=30:d=1",
      "-filter_complex", complex, "-map", "[video]", "-frames:v", "20", "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2500)).toBe(0);
  });

  it("bounds the path even for an erratically-moving subject", () => {
    const busy: FaceBox[] = Array.from({ length: 300 }, (_, i) => ({
      tSec: i * 0.2,
      x: 0.15 + Math.sin(i / 3) * 0.25,
      y: 0.2 + Math.cos(i / 5) * 0.08,
      w: 0.14, h: 0.3, confidence: 95,
    }));
    const kf = computeCropKeyframesForClip(busy, 0, 60, "9:16", 1920, 1080, { smartAutoReframe: true });
    expect(kf!.length).toBeLessThanOrEqual(40);
    const { code, stderr } = run([
      "-hide_banner", "-f", "lavfi", "-i", STATIC_GRADIENT,
      "-vf", buildDynamicCropFilter(kf!, "9:16"), "-f", "null", "-",
    ]);
    expect(code, stderr.slice(-2000)).toBe(0);
  });
});
