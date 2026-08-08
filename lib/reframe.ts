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
  // Active-speaker probability 0..1 from the GPU ASD model (lib/asd.ts).
  // Undefined on any Rekognition-sourced or pre-ASD cached timeline — same
  // rule as mouthOpen: undefined means "no signal", not "silent".
  speaking?: number;
  // Stable per-person identity from the ASD tracker. When present, multi-
  // speaker clustering uses it instead of guessing from horizontal position.
  trackId?: string;
  // Head yaw in degrees: negative = facing frame-left, positive = frame-right.
  // Rekognition returns this under FaceAttributes "ALL" (which we already
  // request) and it was simply discarded. It's what makes "look-room"
  // possible — framing a subject so they look INTO the frame rather than out
  // of it is most of the difference between "cropped" and "composed".
  yaw?: number;
}

// A speaking-score gap narrower than this is a tie: below it the two faces are
// close enough that the model isn't really distinguishing them, and switching
// the crop on that basis produces visible flip-flopping.
const SPEAKING_MARGIN = 0.15;

// How long the "other" person must stay the better candidate before the camera
// commits to them. This was 0.25s, which is shorter than a conversational
// interjection — the crop visibly ping-ponged during back-and-forth dialogue.
// 0.8s is about the point where a switch reads as a decision rather than a
// twitch, and it matches how a human operator waits to be sure.
const SPEAKER_DWELL_SEC = 0.8;

// Target movements smaller than this are ignored outright. Sub-2%-of-frame
// corrections are invisible as framing but very visible as motion, because
// they never settle.
const MOTION_DEAD_ZONE = 0.02;

// How far the frame leads a turned head, as a fraction of the crop width.
// Applied against yaw, so a subject looking frame-left gets space on the left.
const LOOK_ROOM_FRAC = 0.12;
const LOOK_ROOM_FULL_YAW = 30; // degrees at which look-room is fully applied

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
/**
 * Why a detection run produced no faces.
 *
 * "no faces in this video" and "we could not run face detection at all" used to
 * be the same empty array, so the UI blamed the user's video for what was
 * often a server-side fault — an expired credential or, as seen in practice, an
 * IAM policy with no `rekognition:StartFaceDetection` permission, which
 * silently disables speaker tracking for EVERY video on the deployment while
 * telling each user their particular file is the problem.
 */
export type FaceDetectFailure = "unconfigured" | "error" | "timeout";
export interface FaceTimelineResult {
  boxes: FaceBox[];
  /** Absent when detection ran fine — including when it genuinely found no faces. */
  failure?: FaceDetectFailure;
}

export async function detectFaceTimeline(videoUrl: string): Promise<FaceTimelineResult> {
  const loc = parseS3Url(videoUrl);
  if (!loc) {
    logger.warn("reframe", "could not parse S3 url for Rekognition", { videoUrl });
    return { boxes: [], failure: "unconfigured" };
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
    if (!start.JobId) return { boxes: [], failure: "error" };

    const boxes: FaceBox[] = [];
    let nextToken: string | undefined;
    const deadline = Date.now() + MAX_POLL_MS;

    for (;;) {
      const res = await rekognition.send(new GetFaceDetectionCommand({ JobId: start.JobId, NextToken: nextToken }));
      if (res.JobStatus === "FAILED") {
        logger.warn("reframe", "Rekognition job failed", res.StatusMessage);
        return { boxes: [], failure: "error" };
      }
      if (res.JobStatus === "IN_PROGRESS") {
        if (Date.now() > deadline) {
          logger.warn("reframe", "Rekognition job timed out, skipping reframe");
          return { boxes: [], failure: "timeout" };
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
          yaw: f.Face?.Pose?.Yaw ?? undefined,
        });
      }
      if (!res.NextToken) break;
      nextToken = res.NextToken;
    }
    // Reaching here means detection genuinely ran; an empty list is a real
    // "no faces in this footage" answer, not a fault.
    return { boxes };
  } catch (err) {
    // AccessDenied lands here, and it is a deployment fault rather than
    // anything about this video — flag it as such so the copy can say so.
    const name = (err as { name?: string })?.name;
    logger.warn("reframe", "Rekognition face detection unavailable, falling back to center crop", err);
    return { boxes: [], failure: name === "AccessDeniedException" || name === "UnrecognizedClientException" ? "unconfigured" : "error" };
  }
}

// Fixed crop-window size (fraction of source frame) for each aspect, matching
// the dead-center formulas in this route's static fallback. Only one axis
// needs to pan for each aspect (the other stays full-frame), which is what
// makes single-face tracking well-defined without needing zoom.
export function cropSizeFrac(aspect: "9:16" | "16:9" | "1:1", srcW: number, srcH: number): { w: number; h: number } {
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
  let emaAlpha = EMA_ALPHA;
  let maxPanFrac = MAX_PAN_FRAC_PER_BUCKET;
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

        // Three-level degradation, best signal first:
        //  1. ASD speaking probability — an actual model of who is talking.
        //  2. Rekognition MouthOpen — fires on any open mouth, so it's a weak
        //     proxy, but better than nothing.
        //  3. Bounding-box area — a size proxy, not a speaking proxy at all;
        //     the last resort for timelines cached before either existed.
        let candidateId: "left" | "right";
        const lSpeak = leftBest.speaking, rSpeak = rightBest.speaking;
        if (typeof lSpeak === "number" && typeof rSpeak === "number" && Math.abs(lSpeak - rSpeak) > SPEAKING_MARGIN) {
          candidateId = lSpeak > rSpeak ? "left" : "right";
        } else if (leftBest.mouthOpen === true && rightBest.mouthOpen !== true) {
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
          if (activeSpeakerTimer >= SPEAKER_DWELL_SEC) {
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

    // Look-room: bias the frame in the direction the subject is facing, so
    // they look INTO the frame. Shifting the crop centre AGAINST the yaw puts
    // the empty space in front of them.
    const yaw = chosenFace.yaw;
    const lookShift = typeof yaw === "number"
      ? -Math.max(-1, Math.min(1, yaw / LOOK_ROOM_FULL_YAW)) * LOOK_ROOM_FRAC * cropW
      : 0;

    targetCxs[s] = chosenFace.x + chosenFace.w / 2 + lookShift;
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

    // Dead zone: ignore corrections too small to read as reframing. Without
    // this the crop never settles — it chases sub-pixel detector noise, which
    // is the "constantly drifting" look rather than a locked-off shot.
    const dx = smoothCxs[s] - currentCx;
    const dy = smoothCys[s] - currentCy;
    if (Math.abs(dx) > MOTION_DEAD_ZONE) currentCx += emaAlpha * dx;
    if (Math.abs(dy) > MOTION_DEAD_ZONE) currentCy += emaAlpha * dy;
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

    const faceH = faceHeights[s];
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

  // The MERGE_EPS pass above only drops points that barely moved; this drops
  // points that lie on a straight line between their neighbours, which is what
  // actually bounds the generated expression on a continuously-moving subject.
  return simplifyKeyframes(merged);
}

// ── Keyframe simplification ────────────────────────────────────────────────
// computeAdvancedCrop emits a keyframe every 0.1s, and each surviving one adds
// a nesting level to four separate ffmpeg expressions that are re-evaluated
// per frame. A 60s clip of a moving subject measured ~16.5k characters of
// filtergraph before this — under the argv ceiling, but ~3x the point where
// the editor's renderer switches to a filter script, and all of it real
// per-frame expression evaluation.
//
// Douglas-Peucker keeps the points that define the SHAPE of the path and drops
// the ones that sit on a line between their neighbours, so the motion is
// visually identical with a fraction of the points.

const MAX_CROP_KEYFRAMES = 40;
const RDP_EPSILON = 0.004; // fraction of frame — below this a deviation is invisible

/** Perpendicular distance from p to the line ab, in (t, v) space. */
function perpDistance(p: { t: number; v: number }, a: { t: number; v: number }, b: { t: number; v: number }): number {
  const dt = b.t - a.t;
  const dv = b.v - a.v;
  if (dt === 0 && dv === 0) return Math.abs(p.v - a.v);
  return Math.abs(dv * (p.t - a.t) - dt * (p.v - a.v)) / Math.hypot(dt, dv);
}

function rdpKeep(pts: { t: number; v: number }[], eps: number, first: number, last: number, keep: Set<number>): void {
  if (last <= first + 1) return;
  let maxDist = -1;
  let idx = first;
  for (let i = first + 1; i < last; i++) {
    const dist = perpDistance(pts[i], pts[first], pts[last]);
    if (dist > maxDist) { maxDist = dist; idx = i; }
  }
  if (maxDist <= eps) return;
  keep.add(idx);
  rdpKeep(pts, eps, first, idx, keep);
  rdpKeep(pts, eps, idx, last, keep);
}

/**
 * Simplify a crop path, preserving its visual shape. Each axis is simplified
 * independently and the kept indices unioned, so a point that matters on ANY
 * axis survives. Epsilon escalates until the point budget is met, which bounds
 * the generated expression regardless of how busy the source is.
 */
export function simplifyKeyframes(
  keyframes: CropKeyframe[],
  eps = RDP_EPSILON,
  maxPoints = MAX_CROP_KEYFRAMES,
): CropKeyframe[] {
  if (keyframes.length <= 2) return keyframes;

  const axes: (keyof Pick<CropKeyframe, "x" | "y" | "w">)[] = ["x", "y", "w"];
  let epsilon = eps;
  for (let attempt = 0; attempt < 8; attempt++) {
    const keep = new Set<number>([0, keyframes.length - 1]);
    for (const axis of axes) {
      const pts = keyframes.map((k) => ({ t: k.tSec, v: k[axis] }));
      rdpKeep(pts, epsilon, 0, keyframes.length - 1, keep);
    }
    if (keep.size <= maxPoints) {
      return [...keep].sort((a, b) => a - b).map((i) => keyframes[i]);
    }
    epsilon *= 2;
  }
  // Pathological input: fall back to uniform decimation so the budget still
  // holds. The stride leaves room for the final keyframe appended below —
  // dividing by maxPoints exactly would produce maxPoints strided points and
  // then overflow by one when the endpoint is added back.
  const stride = Math.max(1, Math.ceil(keyframes.length / Math.max(1, maxPoints - 1)));
  const decimated = keyframes.filter((_, i) => i % stride === 0);
  const last = keyframes[keyframes.length - 1];
  if (decimated[decimated.length - 1] !== last) decimated.push(last);
  return decimated;
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

  // Preferred: real identities from the ASD tracker. Position-based clustering
  // is a guess that a person stays on their side of the frame — it misfires on
  // one person who walks across, and on two people who cross over. Track ids
  // are the actual answer, so use them when the timeline has them and take the
  // two most consistently-present people.
  let left: FaceBox[];
  let right: FaceBox[];
  const byTrack = new Map<string, FaceBox[]>();
  for (const f of inWindow) {
    if (!f.trackId) { byTrack.clear(); break; }
    const arr = byTrack.get(f.trackId);
    if (arr) arr.push(f); else byTrack.set(f.trackId, [f]);
  }

  if (byTrack.size >= 2) {
    const [a, b] = [...byTrack.values()].sort((p, q) => q.length - p.length).slice(0, 2);
    // Keep a stable left/right assignment so the stacked halves don't swap.
    const meanX = (g: FaceBox[]) => g.reduce((s, f) => s + f.x + f.w / 2, 0) / g.length;
    [left, right] = meanX(a) <= meanX(b) ? [a, b] : [b, a];
    if (meanX(right) - meanX(left) < MIN_SEPARATION_FRAC) return null;
  } else {
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
    left = inWindow.filter((f) => f.x + f.w / 2 < threshold);
    right = inWindow.filter((f) => f.x + f.w / 2 >= threshold);
  }
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

// Piecewise-linear interpolation over keyframes, emitted as a nested-if FFmpeg
// expression. `timeVar` is whatever expression yields seconds in the filter
// being targeted (`t` for crop, `(on/FPS)` for zoompan, which counts output
// frames rather than exposing a clock). `scaleVar` multiplies each value by a
// dimension constant (in_w/in_h/iw/ih) for expressions in pixels; omit it for
// unitless values such as a zoom factor.
function piecewiseExpr(
  pts: { t: number; v: number }[],
  timeVar: string,
  scaleVar?: string,
): string {
  const val = (v: number) => (scaleVar ? `(${v}*${scaleVar})` : `(${v})`);

  // Collapse runs of identical values: a point whose value matches BOTH
  // neighbours sits in the middle of a flat span and contributes an if-branch
  // that can never change the result. This matters — each surviving point is
  // one level of nesting in the emitted expression, re-evaluated per frame per
  // axis, and a centred zoom envelope otherwise repeats the same constant crop
  // origin for every keyframe. Ramp endpoints are preserved, so the
  // interpolated path is unchanged.
  const EPS = 1e-9;
  const kept = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    return !(Math.abs(p.v - pts[i - 1].v) < EPS && Math.abs(p.v - pts[i + 1].v) < EPS);
  });
  if (kept.length === 1) return val(kept[0].v);
  if (kept.length === 2 && Math.abs(kept[0].v - kept[1].v) < EPS) return val(kept[0].v);

  let expr = val(kept[kept.length - 1].v);
  for (let i = kept.length - 2; i >= 0; i--) {
    const { t: t0, v: v0 } = kept[i];
    const { t: t1, v: v1 } = kept[i + 1];
    const dt = t1 - t0;
    // Zero-length spans would divide by zero; snap straight to the later value.
    const seg = dt <= 0
      ? val(v1)
      : scaleVar
        ? `(${v0}*${scaleVar}+(${v1}-${v0})*${scaleVar}*(${timeVar}-${t0})/${dt.toFixed(4)})`
        : `(${v0}+(${v1}-${v0})*(${timeVar}-${t0})/${dt.toFixed(4)})`;
    expr = `if(lt(${timeVar},${t1}),${seg},${expr})`;
  }
  return `if(lt(${timeVar},${kept[0].t}),${val(kept[0].v)},${expr})`;
}

function lerpExpr(varName: "in_w" | "in_h", keyframes: CropKeyframe[], axis: "x" | "y" | "w" | "h"): string {
  return piecewiseExpr(keyframes.map((k) => ({ t: k.tSec, v: k[axis] })), "t", varName);
}

// zoompan counts output frames (`on`) rather than exposing a wall clock, so a
// time-based keyframe path has to be converted using a known output rate. The
// chain pins that rate with an explicit `fps` filter so `on/ZOOM_FPS` is exact
// regardless of the source's frame rate.
export const ZOOM_FPS = 30;

// Builds the pan+zoom chain for a keyframe path whose window SIZE varies.
//
// This cannot be done with `crop` alone. crop's w/h expressions are evaluated
// exactly once, when the filter is configured — `t` isn't even defined there —
// so a time-varying w/h either errors out ("Error when evaluating the
// expression") or, for the nested-if form this module emits, silently collapses
// to whichever branch the config-time evaluation happens to take and stays
// frozen for the whole clip. Verified against ffmpeg 6.1.1; there is no `eval`
// option on crop to change it (unlike overlay/scale).
//
// So the work is split: crop does the panning at a CONSTANT window size (its
// x/y expressions genuinely are re-evaluated per frame), and zoompan — which
// does re-evaluate z/x/y per output frame — does the zooming inside that
// window. The crop window is the largest the path ever needs, so the zoomed
// window is always contained within it and no pixels are invented.
function buildPanZoomChain(keyframes: CropKeyframe[], outW: number, outH: number): string {
  const wMax = Math.min(1, Math.max(...keyframes.map((k) => k.w)));
  const hMax = Math.min(1, Math.max(...keyframes.map((k) => k.h)));
  const maxX = Math.max(0, 1 - wMax);
  const maxY = Math.max(0, 1 - hMax);

  // Crop origin: centre the constant window on each keyframe's own centre,
  // clamped into frame. Because the keyframe window is centred on that same
  // point and is never larger than wMax/hMax, it stays fully inside this crop
  // even where the clamp bites at a frame edge.
  const origins = keyframes.map((k) => ({
    t: k.tSec,
    X: Math.min(maxX, Math.max(0, k.x + k.w / 2 - wMax / 2)),
    Y: Math.min(maxY, Math.max(0, k.y + k.h / 2 - hMax / 2)),
  }));

  const cropX = piecewiseExpr(origins.map((o) => ({ t: o.t, v: o.X })), "t", "in_w");
  const cropY = piecewiseExpr(origins.map((o) => ({ t: o.t, v: o.Y })), "t", "in_h");

  // Inside zoompan, iw/ih are the CROPPED frame's dimensions, so the keyframe
  // window is re-expressed as a fraction of the crop window rather than of the
  // source frame.
  const time = `(on/${ZOOM_FPS})`;
  const zoom = piecewiseExpr(keyframes.map((k) => ({ t: k.tSec, v: k.w > 0 ? wMax / k.w : 1 })), time);
  const panX = piecewiseExpr(keyframes.map((k, i) => ({ t: k.tSec, v: (k.x - origins[i].X) / wMax })), time);
  const panY = piecewiseExpr(keyframes.map((k, i) => ({ t: k.tSec, v: (k.y - origins[i].Y) / hMax })), time);

  // z is clamped at 1 (zoompan cannot zoom out past the frame) and x/y at the
  // window edges, so float drift can never ask for pixels outside the input.
  const zExpr = `max(1,${zoom})`;
  const xExpr = `max(0,min(iw-iw/zoom,(${panX})*iw))`;
  const yExpr = `max(0,min(ih-ih/zoom,(${panY})*ih))`;

  return (
    `fps=${ZOOM_FPS},` +
    `crop=w='${wMax.toFixed(6)}*in_w':h='${hMax.toFixed(6)}*in_h':x='${cropX}':y='${cropY}',` +
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${outW}x${outH}:fps=${ZOOM_FPS}`
  );
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

  // Pan-only: crop's x/y ARE re-evaluated per frame (no `eval` option exists on
  // crop, and none is needed for x/y), so a constant-size window can pan on its
  // own. This is the cheap path — no zoompan, no frame-rate normalisation.
  if (!varyingSize) {
    const w = aspect === "16:9" ? "in_w" : `(in_h*9/16)`;
    const h = aspect === "9:16" ? "in_h" : aspect === "16:9" ? `(in_w*9/16)` : "in_h";
    return `crop=w='${w}':h='${h}':x='${lerpExpr("in_w", keyframes, "x")}':y='${lerpExpr("in_h", keyframes, "y")}'`;
  }

  // Size varies (smart zoom / hook punch-in / cinematic ramp / mood envelope) —
  // crop cannot express that at all, see buildPanZoomChain.
  const target = TARGET_RES[aspect];
  return buildPanZoomChain(keyframes, target.w, target.h);
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
    // Same crop-can't-zoom constraint as buildDynamicCropFilter: a varying
    // window has to go through zoompan, which also pins the half's output size.
    if (varying) return buildPanZoomChain(kf, half.w, half.h);
    const xExpr = lerpExpr("in_w", kf, "x");
    const yExpr = lerpExpr("in_h", kf, "y");
    return `crop=w='(${kf[0].w}*in_w)':h='(${kf[0].h}*in_h)':x='${xExpr}':y='${yExpr}',scale=${half.w}:${half.h}`;
  };
  const top = `${videoSrc}${cropAndScale(a)}[top]`;
  const bot = `${videoSrc}${cropAndScale(b)}[bot]`;

  const postStack = [moodFilter, captionsFilter].filter((f): f is string => !!f);
  const stacked = postStack.length > 0
    ? `[top][bot]vstack=inputs=2[stackedraw];[stackedraw]${postStack.join(",")}[video]`
    : `[top][bot]vstack=inputs=2[video]`;
  return `${top};${bot};${stacked}`;
}
