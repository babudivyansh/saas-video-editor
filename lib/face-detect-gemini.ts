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
// One frame per call. Batching frames into one request was tried and the
// boxes stopped matching their frame: with 15 images in context the model
// returned near-full-frame boxes. Localisation is reliable one image at a time.
const CALL_CONCURRENCY = 6;
const EXTRACT_CONCURRENCY = 4;
/** Gemini reports no confidence; reframe filters below 60, so a found face passes. */
const GEMINI_FACE_CONFIDENCE = 90;

const box = z.array(z.number().min(0).max(1000)).length(4);
// The asked-for {"faces":[[...]]}, or Gemini's own detection habits: a bare
// list, or {"box_2d": [...]} objects. All three seen in practice.
const answerSchema = z.preprocess(
  (raw) => {
    const faces = Array.isArray(raw) ? raw : (raw as { faces?: unknown } | null)?.faces;
    if (!Array.isArray(faces)) return raw;
    return { faces: faces.map((f) => (f && typeof f === "object" && !Array.isArray(f) ? (f as { box_2d?: unknown }).box_2d : f)) };
  },
  z.object({ faces: z.array(box).max(12) }),
);

/** Evenly spaced sample times, a half-interval in from each end. */
export function sampleTimes(durationSec: number): number[] {
  if (!(durationSec > 0)) return [];
  const interval = Math.max(MIN_INTERVAL_SEC, durationSec / MAX_FRAMES);
  const out: number[] = [];
  for (let t = interval / 2; t < durationSec && out.length < MAX_FRAMES; t += interval) {
    out.push(Math.round(t * 1000) / 1000);
  }
  return out;
}

export { answerSchema as faceAnswerSchema };

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
 * frames, every Gemini call failed) — never for "ran fine, found no faces".
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

    let answered = 0;
    const results = await mapLimit(ok, CALL_CONCURRENCY, async (f) => {
      const answer = await geminiJson({
        label: "face-detect",
        parts: [{ inlineData: { mimeType: "image/jpeg", data: fs.readFileSync(f.out).toString("base64") } }, FACE_PROMPT],
        schema: answerSchema,
        timeoutMs: 30_000,
        temperature: 0,
      });
      if (!answer) return [];
      answered++;
      return answerToFaceBoxes(answer, f.t);
    });

    // Most frames unanswered is an outage or a bad key, not a faceless video.
    if (answered < ok.length / 2) {
      logger.warn("face-gemini", `only ${answered}/${ok.length} frames answered`);
      return { boxes: [], failure: "error" };
    }
    const boxes = results.flat().sort((a, b) => a.tSec - b.tSec);
    logger.info("face-gemini", `${boxes.length} face samples from ${ok.length} frames (${answered} answered)`);
    return { boxes };
  } finally {
    fs.rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}
