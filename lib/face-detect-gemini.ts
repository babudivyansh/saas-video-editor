// Face detection from sampled frames, by Gemini — the last rung of the face
// timeline resolver (lib/asd.ts).
//
// Production had no face detector at all: the GPU active-speaker service was
// never deployed (no GPU_SERVICE_URL) and the Rekognition fallback is off by
// default for cost ($0.10 per source-minute). Every AutoClip run therefore
// finished with `reframe_failed` and a centre crop, and a gaming stream lost
// its facecam in every vertical clip. Gemini is already configured for the
// clip pick, sees a webcam overlay as well as a person on camera, and costs
// about a cent for a whole source at this sampling density.
//
// Coarser than a tracker: a frame every few seconds, no identities, no speaking
// score. That is enough to place a facecam (it never moves), to find the
// people in a podcast shot, and to pan to where a single speaker sits.

import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { geminiConfigured, geminiJson } from "@/lib/autoclip-ai/gemini";
import { fromBox2d } from "@/lib/autoclip-ai/scene-vision";
import { logger } from "@/lib/logger";
import type { FaceBox, FaceTimelineResult } from "@/lib/reframe";
import { runFFmpegArgs, ffmpegInputArgs } from "@/utils/ffmpeg-render";

/** At most this many frames per source, whatever its length (~1 cent of Gemini). */
export const MAX_FRAMES = 120;
/** Never sample denser than this, even on a short source. */
export const MIN_INTERVAL_SEC = 1;
/** Default spacing for a short source. One frame a second meant a 1-minute
 *  source made 60 Gemini calls, ~5x what its one billed Clip Minute covers
 *  (pricing audit 2026-11-26). A facecam or a seated speaker barely moves in
 *  3 s. Changes nothing above 6 minutes, where MAX_FRAMES sets the spacing. */
export const SHORT_SOURCE_INTERVAL_SEC = 3;
/** ...but a short source still gets this many frames, so a 30 s clip is not
 *  placed from a handful of looks. */
export const MIN_FRAMES = 20;
// One frame per call. Batching frames into one request was tried and the
// boxes stopped matching their frame: with 15 images in context the model
// returned near-full-frame boxes. Localisation is reliable one image at a time.
//
// That is up to 120 requests per source, so they go through ONE process-wide
// limiter: three AutoClip runs picking at once used to fire 18 calls in
// parallel, every one got a 429 and the run fell back to a centre crop
// (Sentry CLIPIRO-WEB-23, 2026-11-24, only 35/108 frames answered).
export const GLOBAL_CALL_CONCURRENCY = 3;
const EXTRACT_CONCURRENCY = 4;
/** A whole source gets this long for face calls; frames not started by then are skipped. */
export const DETECT_BUDGET_MS = 4 * 60_000;
/** Gemini reports no confidence; reframe filters below 60, so a found face passes. */
const GEMINI_FACE_CONFIDENCE = 90;

/** Rate-limit backoff with ±50% jitter, so the limiter's slots don't retry in lockstep. */
export function jitteredBackoff(baseMs: number[], rand: () => number = Math.random): number[] {
  return baseMs.map((ms) => Math.round(ms * (0.5 + rand())));
}
const PRIMARY_BACKOFF_MS = [2_000, 5_000, 12_000, 25_000];
const FALLBACK_BACKOFF_MS = [4_000, 10_000];

/** A counting semaphore shared by every detection in this process. */
export class Limiter {
  private active = 0;
  private waiting: (() => void)[] = [];
  constructor(readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    else this.active++;
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next(); // hand the slot straight over
      else this.active--;
    }
  }
}
const g = globalThis as { __faceGeminiLimiter?: Limiter };
const callLimiter = (g.__faceGeminiLimiter ??= new Limiter(GLOBAL_CALL_CONCURRENCY));

const box = z.array(z.number().min(0).max(1000)).length(4);
// The asked-for {"faces":[[...]]}, or Gemini's own detection habits: a bare
// list, or {"box_2d": [...]} objects. All three seen in practice.
const answerSchema = z.preprocess(
  (raw) => {
    // null / {} — Gemini's way of saying "no face" on some frames (seen as
    // 200s that failed the schema in CLIPIRO-WEB-23).
    if (raw == null) return { faces: [] };
    const faces = Array.isArray(raw) ? raw : (raw as { faces?: unknown }).faces;
    if (faces === undefined || faces === null) return { faces: [] };
    if (!Array.isArray(faces)) return raw;
    return { faces: faces.map((f) => (f && typeof f === "object" && !Array.isArray(f) ? (f as { box_2d?: unknown }).box_2d : f)) };
  },
  z.object({ faces: z.array(box).max(12) }),
);

/** Evenly spaced sample times, a half-interval in from each end. */
export function sampleTimes(durationSec: number): number[] {
  if (!(durationSec > 0)) return [];
  const interval = Math.max(
    MIN_INTERVAL_SEC,
    Math.min(Math.max(SHORT_SOURCE_INTERVAL_SEC, durationSec / MAX_FRAMES), durationSec / MIN_FRAMES),
  );
  const out: number[] = [];
  for (let t = interval / 2; t < durationSec && out.length < MAX_FRAMES; t += interval) {
    out.push(Math.round(t * 1000) / 1000);
  }
  return out;
}

export { answerSchema as faceAnswerSchema };

/**
 * Frame order for the calls: coarse to fine (ends and middle first, then the
 * gaps between). If calls run out of budget or many fail, what did come back
 * is still spread over the whole source.
 */
export function spreadOrder(n: number): number[] {
  const out: number[] = [];
  const seen = new Uint8Array(n);
  for (let step = 2 ** Math.ceil(Math.log2(Math.max(1, n))); step >= 1; step = Math.floor(step / 2)) {
    for (let i = 0; i < n; i += step) if (!seen[i]) { seen[i] = 1; out.push(i); }
    if (step === 1) break;
  }
  return out;
}

/** Fewest answered frames that make a timeline, however short the source. */
export const MIN_ANSWERED = 8;
const SPREAD_BUCKETS = 10;
const MIN_BUCKET_SHARE = 0.6;

/**
 * Enough answered frames, spread over enough of the source, to build a face
 * timeline. A podcast set or a facecam doesn't move, so a few dozen frames
 * across the whole video say as much as all 120 — what matters is that no
 * large stretch went unseen, not what share of calls answered.
 */
export function answeredCoverageOk(answeredTimes: number[], sampledTimes: number[]): boolean {
  if (sampledTimes.length === 0) return false;
  if (answeredTimes.length < Math.min(MIN_ANSWERED, sampledTimes.length)) return false;
  const lo = sampledTimes[0];
  const span = sampledTimes[sampledTimes.length - 1] - lo;
  const buckets = Math.min(SPREAD_BUCKETS, sampledTimes.length);
  if (span <= 0 || buckets <= 1) return true;
  const bucketOf = (t: number) => Math.min(buckets - 1, Math.floor(((t - lo) / span) * buckets));
  const sampled = new Set(sampledTimes.map(bucketOf));
  const answered = new Set(answeredTimes.map(bucketOf));
  return answered.size >= Math.ceil(sampled.size * MIN_BUCKET_SHARE);
}

export const FACE_PROMPT = `This image is one frame of a video.
Give a tight bounding box around every clearly visible real human face (forehead to chin), including a face in a webcam/facecam overlay.
Do NOT include faces that are part of video-game graphics, textures, cartoons, drawings, posters or thumbnails.
Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 scale of the full frame.
Answer only JSON: {"faces":[[ymin,xmin,ymax,xmax]]}. No face: {"faces":[]}.`;

/** Gemini's answer for one frame → FaceBox samples at that frame's source time. */
export function answerToFaceBoxes(answer: { faces: number[][] }, tSec: number): FaceBox[] {
  const boxes: FaceBox[] = [];
  for (const raw of answer.faces) {
    const b = fromBox2d(raw);
    if (b) boxes.push({ tSec, ...b, confidence: GEMINI_FACE_CONFIDENCE });
  }
  return boxes;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

async function extractFrame(videoPath: string, tSec: number, out: string): Promise<boolean> {
  try {
    // -ss before -i seeks by keyframe index instead of decoding up to t, so a
    // two-hour source costs the same as a two-minute one.
    await runFFmpegArgs([
      "-y", "-ss", tSec.toFixed(3), ...ffmpegInputArgs(videoPath),
      "-frames:v", "1", "-an", "-vf", "scale=640:-2", "-q:v", "5", out,
    ], 30_000);
    return fs.existsSync(out) && fs.statSync(out).size > 0;
  } catch {
    return false;
  }
}

/**
 * A face timeline for a local source file, from Gemini looking at sampled
 * frames. `failure` is set only when detection could not run (no key, no
 * frames, too few calls answered) — never for "ran fine, found no faces".
 */
export async function detectFacesWithGemini(videoPath: string, durationSec: number): Promise<FaceTimelineResult> {
  if (!geminiConfigured()) return { boxes: [], failure: "unconfigured" };
  const times = sampleTimes(durationSec);
  if (times.length === 0) return { boxes: [], failure: "error" };

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "face-gemini-"));
  try {
    const frames = await mapLimit(times, EXTRACT_CONCURRENCY, async (t, i) => {
      const out = path.join(tmp, `f${i}.jpg`);
      return (await extractFrame(videoPath, t, out)) ? { t, out } : null;
    });
    const ok = frames.filter((f): f is { t: number; out: string } => f !== null);
    if (ok.length === 0) {
      logger.warn("face-gemini", "could not extract any frame from the source");
      return { boxes: [], failure: "error" };
    }

    const deadline = Date.now() + DETECT_BUDGET_MS;
    const answeredTimes: number[] = [];
    const results: FaceBox[][] = [];
    let skipped = 0;
    const askFrame = async (f: { t: number; out: string }): Promise<void> => {
      const answer = await geminiJson({
        label: "face-detect",
        parts: [{ inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(f.out).toString("base64") } }, FACE_PROMPT],
        schema: answerSchema,
        timeoutMs: 30_000,
        temperature: 0,
        primaryBackoffMs: jitteredBackoff(PRIMARY_BACKOFF_MS),
        fallbackBackoffMs: jitteredBackoff(FALLBACK_BACKOFF_MS),
        emptyAnswer: { faces: [] },
      });
      if (!answer) return;
      answeredTimes.push(f.t);
      results.push(answerToFaceBoxes(answer, f.t));
    };
    const order = spreadOrder(ok.length);
    let next = 0;
    // A few workers per run, each taking the shared limiter per call: parallel
    // runs then interleave call by call, instead of the last run queuing behind
    // every frame of the first two and running out of budget.
    await Promise.all(Array.from({ length: Math.min(GLOBAL_CALL_CONCURRENCY, order.length) }, async () => {
      while (next < order.length) {
        const f = ok[order[next++]];
        if (Date.now() > deadline) { skipped++; continue; }
        await callLimiter.run(() => askFrame(f));
      }
    }));
    const answered = answeredTimes.length;
    const okTimes = ok.map((f) => f.t);

    // Too few, or bunched in one stretch: an outage or a bad key, not a faceless video.
    if (!answeredCoverageOk(answeredTimes.sort((a, b) => a - b), okTimes)) {
      logger.warn("face-gemini", `only ${answered}/${ok.length} frames answered (${skipped} skipped at the time budget)`);
      return { boxes: [], failure: "error" };
    }
    const boxes = results.flat().sort((a, b) => a.tSec - b.tSec);
    logger.info("face-gemini", `${boxes.length} face samples from ${ok.length} frames (${answered} answered, ${skipped} skipped)`);
    return { boxes };
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}
