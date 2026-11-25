// The AutoClip reframing validation set (2026-11-24, stage 4).
//
// Real footage can't live in the repo, so these build test videos from a real
// face — the head-and-shoulders crop of the podcast demo poster — placed on a
// 1280x720 canvas in each situation the brief listed, and run the WHOLE
// framing path on them: local YuNet detection and tracking, speaker
// assignment, computeClipCrop, and lib/reframe-metrics' score of what the
// renderer would show. A regression anywhere in that chain shows up here as a
// face leaving the frame.

import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";

// autoclip-pipeline starts a BullMQ worker at import unless the queue is
// stubbed (see lib/autoclip-pipeline.test.ts); nothing here touches Redis.
vi.mock("@/lib/render-queue", async () => ({
  createRenderQueue: () => ({ enqueue: async () => {}, driver: "in-process" }),
  NonRetryableError: (await import("@/lib/job-queue")).NonRetryableError,
}));
vi.mock("@/lib/redis", () => ({ redis: { get: async () => null, set: async () => {}, del: async () => {} } }));
import fs from "fs";
import os from "os";
import path from "path";
import { runFFmpegArgs } from "@/utils/ffmpeg-render";
import { DETECT_FPS, detectFacesLocal } from "./face-detect-local";
import { assignSpeaking } from "./active-speaker";
import { computeClipCrop } from "./autoclip-pipeline";
import { cropAt, faceInsideFrac, scoreFraming } from "./reframe-metrics";
import type { FaceBox } from "./reframe";

const W = 1280, H = 720, DUR = 6;
const POSTER = path.join(process.cwd(), "public", "samples", "podcast.webp");
// The guest's head and shoulders in the poster, scaled to ~250x365 on the canvas.
const HEAD = "crop=iw*0.24:ih*0.62:iw*0.55:ih*0.04,scale=250:-2";
const opts = { speakerMode: "auto" as const, smartAutoReframe: true };
const seg = { start: 0, end: DUR, mood: "neutral" } as unknown as Parameters<typeof computeClipCrop>[1];

let dir = "";
beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "reframe-scenarios-")); });
afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });

/** A 6 s, 10 fps video of the head over a plain wall; `layout` is the overlay/drawbox chain. */
async function video(name: string, layout: string): Promise<string> {
  const out = path.join(dir, `${name}.mp4`);
  await runFFmpegArgs([
    "-y", "-f", "lavfi", "-i", `color=c=0xd8d2c8:s=${W}x${H}:r=10:d=${DUR}`, "-loop", "1", "-i", POSTER,
    "-filter_complex", `[1:v]${HEAD}[head];${layout}`, "-t", String(DUR), "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-preset", "ultrafast", out,
  ], 120_000);
  return out;
}

async function frame(file: string): Promise<{ faces: FaceBox[]; crop: ReturnType<typeof computeClipCrop> }> {
  const r = await detectFacesLocal(file, [{ start: 0, end: DUR }], DUR, W, H);
  expect(r.failure).toBeUndefined();
  const faces = r.boxes.filter((f) => f.tSec <= DUR);
  return { faces, crop: computeClipCrop(faces, seg, "9:16", W, H, opts, null) };
}

describe("reframing validation set (real face detector, whole framing path)", () => {
  it("speaker at the extreme left stays fully in frame", async () => {
    const { faces, crop } = await frame(await video("left", "[0:v][head]overlay=x=10:y=200"));
    // Found on (almost) every sampled frame, even this close to the edge.
    expect(faces.length).toBeGreaterThanOrEqual(Math.floor(DUR * DETECT_FPS * 0.9));
    expect(scoreFraming(crop, faces, "9:16", W, H).score).toBeGreaterThanOrEqual(0.95);
  }, 120_000);

  it("speaker at the extreme right stays fully in frame", async () => {
    const { faces, crop } = await frame(await video("right", "[0:v][head]overlay=x=W-w-10:y=200"));
    expect(scoreFraming(crop, faces, "9:16", W, H).score).toBeGreaterThanOrEqual(0.95);
  }, 120_000);

  it("a speaker walking across the frame is followed", async () => {
    const { faces, crop } = await frame(await video("moving", `[0:v][head]overlay=x='60+(W-w-120)*t/${DUR}':y=200`));
    const s = scoreFraming(crop, faces, "9:16", W, H);
    expect(s.score).toBeGreaterThanOrEqual(0.85);
    expect(s.nobodyVisible).toBeLessThanOrEqual(Math.ceil(s.moments * 0.1));
  }, 120_000);

  it("holds steady through a short occlusion instead of jumping", async () => {
    // The head sits left of centre; a dark card covers it from 2.0 to 3.5 s.
    const file = await video("occluded", "[0:v][head]overlay=x=180:y=200,drawbox=x=150:y=180:w=320:h=420:color=0x202020:t=fill:enable='between(t,2,3.5)'");
    const { faces, crop } = await frame(file);
    if (crop?.mode !== "single") throw new Error(`expected a single crop, got ${crop?.mode}`);
    const before = cropAt(crop.keyframes, 1.5)!, during = cropAt(crop.keyframes, 3)!;
    expect(Math.abs(during.x - before.x)).toBeLessThan(0.08);
    const after = faces.filter((f) => f.tSec > 4);
    expect(after.every((f) => faceInsideFrac(f, cropAt(crop.keyframes, f.tSec)!) >= 0.9)).toBe(true);
  }, 120_000);

  it("two people side by side, nobody speaking known: both shown (split)", async () => {
    const { faces, crop } = await frame(await video("two", "[0:v][head]overlay=x=60:y=200[a];[1:v]crop=iw*0.24:ih*0.62:iw*0.55:ih*0.04,scale=250:-2[h2];[a][h2]overlay=x=W-w-60:y=200"));
    expect(new Set(faces.map((f) => f.trackId)).size).toBeGreaterThanOrEqual(2);
    expect(crop?.mode).toBe("split");
    expect(scoreFraming(crop, faces, "9:16", W, H).nobodyVisible).toBe(0);
  }, 120_000);

  it("two people with a transcript: frames whoever is talking", async () => {
    const file = await video("two-talk", "[0:v][head]overlay=x=60:y=200[a];[1:v]crop=iw*0.24:ih*0.62:iw*0.55:ih*0.04,scale=250:-2[h2];[a][h2]overlay=x=W-w-60:y=200");
    const { faces } = await frame(file);
    // A still image has no lip movement, so give the right-hand face a moving
    // mouth while speaker_1 talks — the transcript says when, the face says who.
    const moving = faces.map((f) => ({ ...f, mouthMotion: f.x > 0.5 ? 0.25 : 0.05 }));
    const words = Array.from({ length: 18 }, (_, i) => ({ word: "w", start: i * 300, end: i * 300 + 250, speaker: "speaker_1" }));
    const spoken = assignSpeaking(moving, words);
    const crop = computeClipCrop(spoken, seg, "9:16", W, H, opts, null);
    if (crop?.mode !== "single") throw new Error(`expected cuts to the talker, got ${crop?.mode}`);
    const right = spoken.filter((f) => f.x > 0.5 && f.tSec > 0.5 && f.tSec < 5);
    const inFrame = right.filter((f) => faceInsideFrac(f, cropAt(crop.keyframes, f.tSec)!) >= 0.9).length;
    expect(inFrame / right.length).toBeGreaterThanOrEqual(0.9);
  }, 120_000);

  it("no face at all (a busy screen-like picture) shows the whole frame", async () => {
    const out = path.join(dir, "screen.mp4");
    await runFFmpegArgs(["-y", "-f", "lavfi", "-i", `testsrc2=s=${W}x${H}:r=10:d=${DUR}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", out], 60_000);
    const { faces, crop } = await frame(out);
    expect(faces.filter((f) => f.confidence >= 60)).toHaveLength(0);
    expect(crop).toEqual({ mode: "fit" });
  }, 120_000);
});
