// Speaker-tracking reframe (AutoClip P1.1). AWS Rekognition Video runs once per
// source video (not per clip — it's an async job billed per minute processed),
// producing a coarse face timeline. We smooth that into a per-clip crop path
// and drive FFmpeg's crop filter with time-varying x/y expressions instead of
// the static dead-center crop in lib/crop.ts. Every step here is best-effort:
// any failure (no AWS Rekognition access, no face detected, bad video) falls
// back to null so the caller uses the existing static crop — reframing must
// never block a render.

import {
  RekognitionClient,
  StartFaceDetectionCommand,
  GetFaceDetectionCommand,
} from "@aws-sdk/client-rekognition";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Exported so other Rekognition consumers (lib/asset-moderation.ts) share one
// client instead of each constructing their own.
export const rekognition = new RekognitionClient({
  region: env.AWS_REGION,
  credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
});

export interface FaceBox {
  tSec: number;
  x: number; // Left, fraction 0..1 of frame width
  y: number; // Top, fraction 0..1 of frame height
  w: number; // fraction of frame width
  h: number; // fraction of frame height
  confidence: number;
  // Rekognition's MouthOpen attribute for this face at this frame. Undefined
  // for timelines cached before this field was added, or if Rekognition
  // didn't report it — treat undefined as "no signal", not "closed".
  mouthOpen?: boolean;
}

// Crop keyframe: top-left + size of the crop window, all as fractions of the
// source frame so they're resolution-independent. w/h are constant across a
// clip's keyframes today (pan only, no zoom) but kept per-keyframe for a
// future zoom pass.
export interface CropKeyframe { tSec: number; x: number; y: number; w: number; h: number }

const MAX_POLL_MS = 5 * 60 * 1000; // Rekognition on a long video can take minutes
const POLL_INTERVAL_MS = 3000;

export function parseS3Url(url: string): { bucket: string; key: string } | null {
  const m = /^https:\/\/([^.]+)\.s3\.[^/]+\.amazonaws\.com\/(.+)$/.exec(url);
  if (!m) return null;
  return { bucket: m[1], key: decodeURIComponent(m[2]) };
}

// Runs AWS Rekognition Video face detection for the whole source video and
// returns every detected face sample. Requires the IAM credentials already
// configured for S3 (env.AWS_*) to also have rekognition:StartFaceDetection /
// rekognition:GetFaceDetection — if they don't, this logs a warning and
// returns [] rather than throwing.
export async function detectFaceTimeline(videoUrl: string): Promise<FaceBox[]> {
  const loc = parseS3Url(videoUrl);
  if (!loc) {
    logger.warn("reframe", "could not parse S3 url for Rekognition", { videoUrl });
    return [];
  }

  try {
    const start = await rekognition.send(new StartFaceDetectionCommand({
      Video: { S3Object: { Bucket: loc.bucket, Name: loc.key } },
      // "ALL" (vs. the previous "DEFAULT") is the same job/cost, but also
      // returns MouthOpen per face per frame — a real signal for "who's
      // talking" that the two-speaker active-speaker chooser below can use
      // instead of guessing from bounding-box area alone.
      FaceAttributes: "ALL",
    }));
    if (!start.JobId) return [];

    const boxes: FaceBox[] = [];
    let nextToken: string | undefined;
    const deadline = Date.now() + MAX_POLL_MS;

    for (;;) {
      const res = await rekognition.send(new GetFaceDetectionCommand({ JobId: start.JobId, NextToken: nextToken }));
      if (res.JobStatus === "FAILED") {
        logger.warn("reframe", "Rekognition job failed", res.StatusMessage);
        return [];
      }
      if (res.JobStatus === "IN_PROGRESS") {
        if (Date.now() > deadline) {
          logger.warn("reframe", "Rekognition job timed out, skipping reframe");
          return [];
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }
      for (const f of res.Faces ?? []) {
        const bb = f.Face?.BoundingBox;
        if (!bb || f.Timestamp == null) continue;
        boxes.push({
          tSec: f.Timestamp / 1000,
          x: bb.Left ?? 0, y: bb.Top ?? 0, w: bb.Width ?? 0, h: bb.Height ?? 0,
          confidence: f.Face?.Confidence ?? 0,
          // undefined (not false) for any cached timeline recorded before
          // this field existed, or if Rekognition didn't return it — callers
          // must treat undefined as "no signal" and fall back to area-based
          // comparison, not as "mouth closed".
          mouthOpen: f.Face?.MouthOpen?.Value,
        });
      }
      if (!res.NextToken) break;
      nextToken = res.NextToken;
    }
    return boxes;
  } catch (err) {
    logger.warn("reframe", "Rekognition face detection unavailable, falling back to center crop", err);
    return [];
  }
}

// Fixed crop-window size (fraction of source frame) for each aspect, matching
// the dead-center formulas in this route's static fallback. Only one axis
// needs to pan for each aspect (the other stays full-frame), which is what
// makes single-face tracking well-defined without needing zoom.
function cropSizeFrac(aspect: "9:16" | "16:9" | "1:1", srcW: number, srcH: number): { w: number; h: number } {
  if (aspect === "9:16") return { w: Math.min(1, (srcH * 9) / 16 / srcW), h: 1 };
  if (aspect === "16:9") return { w: 1, h: Math.min(1, (srcW * 9) / 16 / srcH) };
  // 1:1 — full height, width-of-height window (only meaningful when srcW > srcH)
  return { w: Math.min(1, srcH / srcW), h: 1 };
}

const BUCKET_SEC = 0.5;
const MIN_CONFIDENCE = 60;
const EMA_ALPHA = 0.35; // smoothing weight for new samples
const MAX_PAN_FRAC_PER_BUCKET = 0.06; // clamp how fast the crop window can move

// Shared smoothing core: buckets a pre-filtered face list into an EMA +
// pan-rate-clamped crop path at a fixed crop size. Used both for the
// single-speaker path and, per-cluster, for the multi-speaker split-screen
// path below — the only difference is which faces are handed in.
function smoothFacesToKeyframes(
  facesInClipRelativeTime: FaceBox[],
  durationSec: number,
  cropW: number,
  cropH: number,
  preset?: string
): CropKeyframe[] {
  let emaAlpha = 0.35;
  let maxPanFrac = 0.06;
  let cinematicZoom = false;

  if (preset === "minimal") {
    emaAlpha = 0.1;
    maxPanFrac = 0.02;
  } else if (preset === "dynamic") {
    emaAlpha = 0.6;
    maxPanFrac = 0.12;
  } else if (preset === "cinematic") {
    emaAlpha = 0.2;
    maxPanFrac = 0.04;
    cinematicZoom = true;
  }

  const bucketCount = Math.max(1, Math.ceil(durationSec / BUCKET_SEC));
  let smoothCx: number | null = null;
  let smoothCy: number | null = null;
  let lastX = 0, lastY = 0;
  const raw: CropKeyframe[] = [];

  for (let b = 0; b < bucketCount; b++) {
    const bucketStart = b * BUCKET_SEC;
    const bucketEnd = Math.min(durationSec, bucketStart + BUCKET_SEC);
    const inBucket = facesInClipRelativeTime.filter((f) => f.tSec >= bucketStart && f.tSec < bucketEnd);
    const best = inBucket.length > 0
      ? inBucket.reduce((a, c) => (c.confidence > a.confidence ? c : a))
      : null;

    if (best) {
      const cx = best.x + best.w / 2;
      const cy = best.y + best.h / 2;
      smoothCx = smoothCx == null ? cx : smoothCx + emaAlpha * (cx - smoothCx);
      smoothCy = smoothCy == null ? cy : smoothCy + emaAlpha * (cy - smoothCy);
    }
    if (smoothCx == null || smoothCy == null) continue; // no face seen yet, skip until we have one

    // Calculate dynamic zoom for cinematic preset (slow Ken Burns zoom in from 100% to 88% size)
    const progress = b / (bucketCount - 1 || 1);
    const scale = cinematicZoom ? (1 - 0.12 * progress) : 1;
    const curW = cropW * scale;
    const curH = cropH * scale;

    const maxX = 1 - curW;
    const maxY = 1 - curH;

    let x = Math.min(maxX, Math.max(0, smoothCx - curW / 2));
    let y = Math.min(maxY, Math.max(0, smoothCy - curH / 2));
    if (raw.length > 0) {
      x = Math.min(lastX + maxPanFrac, Math.max(lastX - maxPanFrac, x));
      y = Math.min(lastY + maxPanFrac, Math.max(lastY - maxPanFrac, y));
    }
    lastX = x; lastY = y;
    raw.push({ tSec: bucketStart, x, y, w: curW, h: curH });
  }
  if (raw.length === 0) return [];

  // Collapse near-identical consecutive keyframes so the FFmpeg expression
  // stays small — only emit a breakpoint when the position actually moved.
  const MERGE_EPS = 0.01;
  const merged: CropKeyframe[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = raw[i];
    if (Math.abs(cur.x - prev.x) > MERGE_EPS || Math.abs(cur.y - prev.y) > MERGE_EPS || Math.abs(cur.w - prev.w) > MERGE_EPS) merged.push(cur);
  }
  return merged;
}

// Slices the full-video face timeline to one clip's window, buckets it,
// smooths with an EMA + pan-rate clamp, and returns a compact crop path in
// clip-relative time. Returns null if there's no usable face signal (caller
// falls back to the static center crop).
export interface ReframeOptions {
  preset?: string;
  smartAutoReframe?: boolean;
  zoomStrength?: "low" | "medium" | "high";
  speakerMode?: "auto" | "single" | "split" | "active";
  smoothness?: number; // 0..100
  trackingSpeed?: number; // 0..100
  words?: { word: string; start: number; end: number }[] | null;
}

export const REFRAME_PRESETS = ["balanced", "minimal", "dynamic", "cinematic"] as const;
export const ZOOM_STRENGTHS = ["low", "medium", "high"] as const;
export const SPEAKER_MODES = ["auto", "single", "split", "active"] as const;

// Validates untrusted request-body values against the enums/ranges reframe
// options are actually constrained to, returning undefined (so the caller's
// `?? default` applies) for anything missing or malformed instead of letting
// a bad client value flow straight into ffmpeg filter generation.
export function sanitizeReframeEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function sanitizeReframePercent(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, n));
}

function computeAdvancedCrop(
  faces: FaceBox[],
  duration: number,
  cropW: number,
  cropH: number,
  aspect: "9:16" | "16:9" | "1:1",
  options: ReframeOptions
): CropKeyframe[] {
  const smart = options.smartAutoReframe !== false;
  const zoomStr = options.zoomStrength ?? "medium";
  const mode = options.speakerMode ?? "auto";
  const smoothnessVal = options.smoothness ?? 50;
  const speedVal = options.trackingSpeed ?? 50;
  const words = options.words ?? null;
  const preset = options.preset ?? "balanced";

  const stepsCount = Math.max(1, Math.round(duration / 0.1));
  const targetScales = new Array<number>(stepsCount).fill(1.0);
  const targetCxs = new Array<number>(stepsCount).fill(0.5);
  const targetCys = new Array<number>(stepsCount).fill(0.5);
  const faceWidths = new Array<number>(stepsCount).fill(0.15);
  const faceHeights = new Array<number>(stepsCount).fill(0.15);

  const zoomScaleMap = {
    low: { hook: 1.05, question: 1.08, emotion: 1.10 },
    medium: { hook: 1.12, question: 1.16, emotion: 1.20 },
    high: { hook: 1.18, question: 1.24, emotion: 1.30 },
  }[zoomStr];

  for (let s = 0; s < stepsCount; s++) {
    const t = s * 0.1;
    let extraZoom = 1.0;

    if (smart) {
      if (t <= 3.0) {
        extraZoom = Math.max(extraZoom, zoomScaleMap.hook);
      }
      if (words && words.length > 0) {
        for (const w of words) {
          const isQ = w.word.endsWith("?") || /^(what|why|how|who|when|where)/i.test(w.word);
          const isE = w.word.endsWith("!") || /^[A-Z]{2,}$/.test(w.word) || /^(haha|lol|laugh|crazy|insane|wow|oh|omg)/i.test(w.word);

          if (isQ && t >= w.start - 1.5 && t <= w.end + 1.5) {
            extraZoom = Math.max(extraZoom, zoomScaleMap.question);
          }
          if (isE && t >= w.start - 1.0 && t <= w.end + 1.0) {
            extraZoom = Math.max(extraZoom, zoomScaleMap.emotion);
          }
        }
      }
    } else if (preset === "cinematic") {
      extraZoom = 1.0 + 0.12 * (s / (stepsCount - 1 || 1));
    }

    targetScales[s] = 1 / extraZoom;
  }

  let activeSpeakerId: "left" | "right" | "single" = "single";
  let activeSpeakerTimer = 0;
  
  const centers = faces.map((f) => f.x + f.w / 2).sort((a, b) => a - b);
  let threshold = 0.5;
  let hasTwoSpeakers = false;
  if (centers.length >= 4) {
    let splitIdx = Math.floor(centers.length / 2);
    let maxGap = -1;
    for (let i = 1; i < centers.length; i++) {
      const gap = centers[i] - centers[i - 1];
      if (gap > maxGap) { maxGap = gap; splitIdx = i; }
    }
    threshold = (centers[splitIdx - 1] + centers[splitIdx]) / 2;
    const leftGroup = faces.filter((f) => f.x + f.w / 2 < threshold);
    const rightGroup = faces.filter((f) => f.x + f.w / 2 >= threshold);
    if (leftGroup.length > 0 && rightGroup.length > 0) {
      const leftAvg = leftGroup.reduce((sum, f) => sum + f.x + f.w / 2, 0) / leftGroup.length;
      const rightAvg = rightGroup.reduce((sum, f) => sum + f.x + f.w / 2, 0) / rightGroup.length;
      if (rightAvg - leftAvg > MIN_SEPARATION_FRAC) {
        hasTwoSpeakers = true;
      }
    }
  }

  for (let s = 0; s < stepsCount; s++) {
    const t = s * 0.1;
    const windowFaces = faces.filter((f) => Math.abs(f.tSec - t) <= 0.25);
    
    if (windowFaces.length === 0) {
      targetCxs[s] = s > 0 ? targetCxs[s - 1] : 0.5;
      targetCys[s] = s > 0 ? targetCys[s - 1] : 0.5;
      faceWidths[s] = s > 0 ? faceWidths[s - 1] : 0.15;
      faceHeights[s] = s > 0 ? faceHeights[s - 1] : 0.15;
      continue;
    }

    let chosenFace = windowFaces[0];

    if (hasTwoSpeakers && (mode === "active" || mode === "auto")) {
      const leftFaces = windowFaces.filter((f) => f.x + f.w / 2 < threshold);
      const rightFaces = windowFaces.filter((f) => f.x + f.w / 2 >= threshold);

      if (leftFaces.length > 0 && rightFaces.length > 0) {
        const leftBest = leftFaces.reduce((a, c) => (c.confidence > a.confidence ? c : a));
        const rightBest = rightFaces.reduce((a, c) => (c.confidence > a.confidence ? c : a));

        // Prefer an actual "who's talking" signal (Rekognition's MouthOpen)
        // when exactly one side has it — only fall back to bounding-box area
        // (a size proxy, not a speaking proxy) when the mouth signal is
        // absent (cached pre-MouthOpen timeline) or doesn't disambiguate
        // (both/neither mouth open).
        let candidateId: "left" | "right";
        if (leftBest.mouthOpen === true && rightBest.mouthOpen !== true) {
          candidateId = "left";
        } else if (rightBest.mouthOpen === true && leftBest.mouthOpen !== true) {
          candidateId = "right";
        } else {
          const leftArea = leftBest.w * leftBest.h;
          const rightArea = rightBest.w * rightBest.h;
          candidateId = leftArea > rightArea ? "left" : "right";
        }
        if (candidateId !== activeSpeakerId) {
          activeSpeakerTimer += 0.1;
          if (activeSpeakerTimer >= 0.25) {
            activeSpeakerId = candidateId;
            activeSpeakerTimer = 0;
          }
        } else {
          activeSpeakerTimer = 0;
        }
        chosenFace = activeSpeakerId === "left" ? leftBest : rightBest;
      } else if (leftFaces.length > 0) {
        chosenFace = leftFaces.reduce((a, c) => (c.confidence > a.confidence ? c : a));
        activeSpeakerId = "left";
        activeSpeakerTimer = 0;
      } else if (rightFaces.length > 0) {
        chosenFace = rightFaces.reduce((a, c) => (c.confidence > a.confidence ? c : a));
        activeSpeakerId = "right";
        activeSpeakerTimer = 0;
      }
    } else {
      chosenFace = windowFaces.reduce((best, cur) => {
        const bestArea = best.w * best.h;
        const curArea = cur.w * cur.h;
        const bestDist = Math.abs(best.x + best.w / 2 - 0.5);
        const curDist = Math.abs(cur.x + cur.w / 2 - 0.5);

        const bestScore = bestArea * 1.5 - bestDist;
        const curScore = curArea * 1.5 - curDist;
        return curScore > bestScore ? cur : best;
      });
    }

    targetCxs[s] = chosenFace.x + chosenFace.w / 2;
    targetCys[s] = chosenFace.y + chosenFace.h / 2;
    faceWidths[s] = chosenFace.w;
    faceHeights[s] = chosenFace.h;
  }

  const windowHalf = Math.round((smoothnessVal / 100) * 7);
  const smoothCxs = new Array<number>(stepsCount);
  const smoothCys = new Array<number>(stepsCount);
  const smoothScales = new Array<number>(stepsCount);

  for (let s = 0; s < stepsCount; s++) {
    let sumCx = 0, sumCy = 0, sumScale = 0, count = 0;
    const startIdx = Math.max(0, s - windowHalf);
    const endIdx = Math.min(stepsCount - 1, s + windowHalf);
    for (let j = startIdx; j <= endIdx; j++) {
      sumCx += targetCxs[j];
      sumCy += targetCys[j];
      sumScale += targetScales[j];
      count++;
    }
    smoothCxs[s] = sumCx / count;
    smoothCys[s] = sumCy / count;
    smoothScales[s] = sumScale / count;
  }

  const customAlpha = 0.8 - (smoothnessVal / 100) * 0.7;
  const emaAlpha = customAlpha;
  const maxPanFrac = 0.01 + (speedVal / 100) * 0.11;

  const keyframes: CropKeyframe[] = [];
  let currentCx = smoothCxs[0];
  let currentCy = smoothCys[0];
  let currentScale = smoothScales[0];

  for (let s = 0; s < stepsCount; s++) {
    const t = s * 0.1;

    currentCx = currentCx + emaAlpha * (smoothCxs[s] - currentCx);
    currentCy = currentCy + emaAlpha * (smoothCys[s] - currentCy);
    currentScale = currentScale + emaAlpha * (smoothScales[s] - currentScale);

    if (s > 0) {
      const prev = keyframes[s - 1];
      const prevCx = prev.x + prev.w / 2;
      const prevCy = prev.y + prev.h / 2;
      currentCx = Math.min(prevCx + maxPanFrac, Math.max(prevCx - maxPanFrac, currentCx));
      currentCy = Math.min(prevCy + maxPanFrac, Math.max(prevCy - maxPanFrac, currentCy));
    }

    const w = cropW * currentScale;
    const h = cropH * currentScale;

    const faceW = faceWidths[s];
    const faceH = faceHeights[s];
    const faceX = currentCx - faceW / 2;
    const faceY = currentCy - faceH / 2;

    const eyesY = faceY + faceH * 0.35;
    const faceY1 = faceY;
    const faceY2 = faceY + faceH;

    let targetY = eyesY - h * 0.35;

    const minY = faceY2 - h * 0.90;
    const maxY = faceY1 - h * 0.10;
    targetY = Math.min(maxY, Math.max(minY, targetY));

    const y = Math.min(1 - h, Math.max(0, targetY));
    const targetX = currentCx - w / 2;
    const x = Math.min(1 - w, Math.max(0, targetX));

    keyframes.push({ tSec: t, x, y, w, h });
  }

  const MERGE_EPS = 0.005;
  const merged: CropKeyframe[] = [keyframes[0]];
  for (let i = 1; i < keyframes.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = keyframes[i];
    if (
      Math.abs(cur.x - prev.x) > MERGE_EPS ||
      Math.abs(cur.y - prev.y) > MERGE_EPS ||
      Math.abs(cur.w - prev.w) > MERGE_EPS
    ) {
      merged.push(cur);
    }
  }

  if (merged[merged.length - 1].tSec < duration - 0.05) {
    const last = keyframes[keyframes.length - 1];
    merged.push({ ...last, tSec: duration });
  }

  return merged;
}

export function computeCropKeyframesForClip(
  allFaces: FaceBox[],
  clipStartSec: number,
  clipEndSec: number,
  aspect: "9:16" | "16:9" | "1:1",
  srcW: number,
  srcH: number,
  optionsOrPreset?: ReframeOptions | string
): CropKeyframe[] | null {
  const options = typeof optionsOrPreset === "string" ? { preset: optionsOrPreset } : (optionsOrPreset ?? {});
  const preset = options.preset ?? "balanced";
  const { w: cropW, h: cropH } = cropSizeFrac(aspect, srcW, srcH);
  
  const varyingSize = preset === "cinematic" || options.smartAutoReframe !== false;
  if (cropW >= 0.999 && cropH >= 0.999 && !varyingSize) return null;

  const inWindow = allFaces
    .filter((f) => f.tSec >= clipStartSec && f.tSec <= clipEndSec && f.confidence >= MIN_CONFIDENCE)
    .map((f) => ({ ...f, tSec: f.tSec - clipStartSec }))
    .sort((a, b) => a.tSec - b.tSec);
  
  if (inWindow.length === 0 && (preset === "cinematic" || options.smartAutoReframe !== false)) {
    return buildZoomEnvelope(clipEndSec - clipStartSec, aspect, srcW, srcH);
  }

  if (inWindow.length === 0) return null;

  if (options.smartAutoReframe !== false) {
    return computeAdvancedCrop(inWindow, clipEndSec - clipStartSec, cropW, cropH, aspect, options);
  }

  const merged = smoothFacesToKeyframes(inWindow, clipEndSec - clipStartSec, cropW, cropH, preset);
  return merged.length > 1 ? merged : null;
}

// ── Multi-speaker split-screen (P1.1 extension) ─────────────────────────────
// When two people are consistently on screen at meaningfully different
// horizontal positions, a single pan-crop has to choose one and cuts the
// other out. Detect that case and produce two independent crop-keyframe
// tracks (one per speaker) instead of one — the renderer stacks them.

export interface MultiSpeakerResult { a: CropKeyframe[]; b: CropKeyframe[] }

// Discriminated shape persisted on Clip.cropKeyframes — "single" covers both
// plain panning and the zoom envelope (buildDynamicCropFilter tells them
// apart by whether w/h vary), "split" is the two-speaker vstack path.
export type StoredCrop =
  | { mode: "single"; keyframes: CropKeyframe[] }
  | { mode: "split"; a: CropKeyframe[]; b: CropKeyframe[] };

const MIN_SEPARATION_FRAC = 0.25; // faces must differ by >25% of frame width to count as "two people"
const MIN_DUAL_COVERAGE = 0.4; // both clusters must each appear in >=40% of buckets

export function computeMultiSpeakerKeyframes(
  allFaces: FaceBox[],
  clipStartSec: number,
  clipEndSec: number,
  srcW: number,
  srcH: number,
  optionsOrPreset?: ReframeOptions | string
): MultiSpeakerResult | null {
  const options = typeof optionsOrPreset === "string" ? { preset: optionsOrPreset } : (optionsOrPreset ?? {});
  const preset = options.preset ?? "balanced";
  // Split-screen halves are each a 9:16-shaped window sized to half the
  // canvas height once stacked — reuse the same single-speaker crop width
  // (a 9:16 slice of the source), just applied twice.
  const { w: cropW, h: cropH } = cropSizeFrac("9:16", srcW, srcH);
  if (cropW >= 0.999) return null; // source is already narrow enough that there's no room to split

  const inWindow = allFaces
    .filter((f) => f.tSec >= clipStartSec && f.tSec <= clipEndSec && f.confidence >= MIN_CONFIDENCE)
    .map((f) => ({ ...f, tSec: f.tSec - clipStartSec }))
    .sort((a, b) => a.tSec - b.tSec);
  if (inWindow.length < 4) return null; // too sparse to trust a 2-cluster split

  // Cheap 1-D k=2 clustering on horizontal center — good enough for "left
  // person" vs "right person" without pulling in a clustering dependency.
  // Split at the largest gap in the sorted centers rather than a fixed-rank
  // median: a median index is unstable whenever many samples tie at/near the
  // boundary (e.g. two evenly-sampled speakers), which can empty one side.
  const centers = inWindow.map((f) => f.x + f.w / 2).sort((a, b) => a - b);
  let splitIdx = Math.floor(centers.length / 2);
  let maxGap = -1;
  for (let i = 1; i < centers.length; i++) {
    const gap = centers[i] - centers[i - 1];
    if (gap > maxGap) { maxGap = gap; splitIdx = i; }
  }
  const threshold = (centers[splitIdx - 1] + centers[splitIdx]) / 2;
  const left = inWindow.filter((f) => f.x + f.w / 2 < threshold);
  const right = inWindow.filter((f) => f.x + f.w / 2 >= threshold);
  if (left.length === 0 || right.length === 0) return null;

  const leftAvg = left.reduce((s, f) => s + f.x + f.w / 2, 0) / left.length;
  const rightAvg = right.reduce((s, f) => s + f.x + f.w / 2, 0) / right.length;
  if (rightAvg - leftAvg < MIN_SEPARATION_FRAC) return null; // one person moving around, not two people

  const duration = clipEndSec - clipStartSec;
  const bucketCount = Math.max(1, Math.ceil(duration / BUCKET_SEC));
  const leftBuckets = new Set(left.map((f) => Math.floor(f.tSec / BUCKET_SEC)));
  const rightBuckets = new Set(right.map((f) => Math.floor(f.tSec / BUCKET_SEC)));
  if (leftBuckets.size / bucketCount < MIN_DUAL_COVERAGE || rightBuckets.size / bucketCount < MIN_DUAL_COVERAGE) {
    return null; // one side isn't consistently present — not a real two-speaker scene
  }

  const a = smoothFacesToKeyframes(left, duration, cropW, cropH, preset);
  const b = smoothFacesToKeyframes(right, duration, cropW, cropH, preset);
  if (a.length === 0 || b.length === 0) return null;
  return { a, b };
}

function lerpExpr(varName: "in_w" | "in_h", keyframes: CropKeyframe[], axis: "x" | "y" | "w" | "h"): string {
  const pts = keyframes.map((k) => ({ t: k.tSec, v: k[axis] }));
  let expr = `(${pts[pts.length - 1].v}*${varName})`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const { t: t0, v: v0 } = pts[i];
    const { t: t1, v: v1 } = pts[i + 1];
    const seg = `(${v0}*${varName}+(${v1}-${v0})*${varName}*(t-${t0})/${(t1 - t0).toFixed(4)})`;
    expr = `if(lt(t,${t1}),${seg},${expr})`;
  }
  return `if(lt(t,${pts[0].t}),(${pts[0].v}*${varName}),${expr})`;
}

export const TARGET_RES: Record<"9:16" | "16:9" | "1:1", { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 }, "16:9": { w: 1920, h: 1080 }, "1:1": { w: 1080, h: 1080 },
};

// Builds the FFmpeg crop filter fragment (no leading/trailing comma) that pans
// (and, if the keyframes' w/h vary, zooms) across the given keyframes. When
// size varies, a fixed-resolution scale is appended afterward — a video
// stream can't change frame size mid-encode, so a shrinking crop window must
// always be scaled back up to a constant output size.
export function buildDynamicCropFilter(keyframes: CropKeyframe[], aspect: "9:16" | "16:9" | "1:1"): string {
  const varyingSize = keyframes.some((k) => k.w !== keyframes[0].w || k.h !== keyframes[0].h);
  const xExpr = lerpExpr("in_w", keyframes, "x");
  const yExpr = lerpExpr("in_h", keyframes, "y");

  // No `eval` option exists on the crop filter (unlike e.g. overlay) — its
  // x/y/w/h expressions are already re-evaluated every frame by default when
  // they reference `t`, so nothing extra is needed to get per-frame panning.
  if (!varyingSize) {
    const w = aspect === "16:9" ? "in_w" : `(in_h*9/16)`;
    const h = aspect === "9:16" ? "in_h" : aspect === "16:9" ? `(in_w*9/16)` : "in_h";
    return `crop=w='${w}':h='${h}':x='${xExpr}':y='${yExpr}'`;
  }
  const wExpr = lerpExpr("in_w", keyframes, "w");
  const hExpr = lerpExpr("in_h", keyframes, "h");
  const target = TARGET_RES[aspect];
  return `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=${target.w}:${target.h}`;
}

const ZOOM_PEAK = 0.92; // crop window shrinks to 92% of normal at the envelope's peak (~8.7% visual zoom-in)
const ZOOM_STEPS = 8;

// A simple, safe "breathing" zoom envelope with no face-tracking dependency —
// crops progressively tighter toward center and back over the clip. Used as
// a mild emphasis effect for energetic/dramatic clips that don't already have
// a speaker-tracking pan path (combining a pan AND a zoom envelope would need
// merging two independent dynamic paths — more risk than value for a subtle
// polish effect, so this only applies when there's no pan data).
export function buildZoomEnvelope(clipDurationSec: number, aspect: "9:16" | "16:9" | "1:1", srcW: number, srcH: number): CropKeyframe[] {
  const { w: baseW, h: baseH } = cropSizeFrac(aspect, srcW, srcH);
  const kf: CropKeyframe[] = [];
  for (let i = 0; i <= ZOOM_STEPS; i++) {
    const t = (i / ZOOM_STEPS) * clipDurationSec;
    const phase = Math.sin((i / ZOOM_STEPS) * Math.PI); // eases 0 -> 1 -> 0
    const scale = 1 - (1 - ZOOM_PEAK) * phase;
    const w = baseW * scale, h = baseH * scale;
    kf.push({ tSec: t, x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  }
  return kf;
}

// Two independently-panning crops (one per speaker) stacked into a single
// vertical split-screen, mirroring the static vstack technique already used
// by utils/ffmpeg-render.ts's runSplitScreenFFmpeg — same shape, just with
// per-input dynamic crop expressions instead of one static crop.
export function buildSplitScreenFilterComplex(
  a: CropKeyframe[],
  b: CropKeyframe[],
  moodFilter: string | null,
  captionsFilter: string | null,
  videoSrc = "[0:v]"
): string {
  const half = { w: 1080, h: 960 };
  const cropAndScale = (kf: CropKeyframe[]) => {
    const varying = kf.some((k) => k.w !== kf[0].w || k.h !== kf[0].h);
    const xExpr = lerpExpr("in_w", kf, "x");
    const yExpr = lerpExpr("in_h", kf, "y");
    const wExpr = varying ? lerpExpr("in_w", kf, "w") : `(${kf[0].w}*in_w)`;
    const hExpr = varying ? lerpExpr("in_h", kf, "h") : `(${kf[0].h}*in_h)`;
    return `crop=w='${wExpr}':h='${hExpr}':x='${xExpr}':y='${yExpr}',scale=${half.w}:${half.h}`;
  };
  const top = `${videoSrc}${cropAndScale(a)}[top]`;
  const bot = `${videoSrc}${cropAndScale(b)}[bot]`;

  const postStack = [moodFilter, captionsFilter].filter((f): f is string => !!f);
  const stacked = postStack.length > 0
    ? `[top][bot]vstack=inputs=2[stackedraw];[stackedraw]${postStack.join(",")}[video]`
    : `[top][bot]vstack=inputs=2[video]`;
  return `${top};${bot};${stacked}`;
}
