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

const rekognition = new RekognitionClient({
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
      FaceAttributes: "DEFAULT",
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
): CropKeyframe[] {
  const bucketCount = Math.max(1, Math.ceil(durationSec / BUCKET_SEC));
  const maxX = 1 - cropW;
  const maxY = 1 - cropH;

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
      smoothCx = smoothCx == null ? cx : smoothCx + EMA_ALPHA * (cx - smoothCx);
      smoothCy = smoothCy == null ? cy : smoothCy + EMA_ALPHA * (cy - smoothCy);
    }
    if (smoothCx == null || smoothCy == null) continue; // no face seen yet, skip until we have one

    let x = Math.min(maxX, Math.max(0, smoothCx - cropW / 2));
    let y = Math.min(maxY, Math.max(0, smoothCy - cropH / 2));
    if (raw.length > 0) {
      x = Math.min(lastX + MAX_PAN_FRAC_PER_BUCKET, Math.max(lastX - MAX_PAN_FRAC_PER_BUCKET, x));
      y = Math.min(lastY + MAX_PAN_FRAC_PER_BUCKET, Math.max(lastY - MAX_PAN_FRAC_PER_BUCKET, y));
    }
    lastX = x; lastY = y;
    raw.push({ tSec: bucketStart, x, y, w: cropW, h: cropH });
  }
  if (raw.length === 0) return [];

  // Collapse near-identical consecutive keyframes so the FFmpeg expression
  // stays small — only emit a breakpoint when the position actually moved.
  const MERGE_EPS = 0.01;
  const merged: CropKeyframe[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = raw[i];
    if (Math.abs(cur.x - prev.x) > MERGE_EPS || Math.abs(cur.y - prev.y) > MERGE_EPS) merged.push(cur);
  }
  return merged;
}

// Slices the full-video face timeline to one clip's window, buckets it,
// smooths with an EMA + pan-rate clamp, and returns a compact crop path in
// clip-relative time. Returns null if there's no usable face signal (caller
// falls back to the static center crop).
export function computeCropKeyframesForClip(
  allFaces: FaceBox[],
  clipStartSec: number,
  clipEndSec: number,
  aspect: "9:16" | "16:9" | "1:1",
  srcW: number,
  srcH: number,
): CropKeyframe[] | null {
  const { w: cropW, h: cropH } = cropSizeFrac(aspect, srcW, srcH);
  // Nothing to pan — the crop already spans the full axis in both dimensions.
  if (cropW >= 0.999 && cropH >= 0.999) return null;

  const inWindow = allFaces
    .filter((f) => f.tSec >= clipStartSec && f.tSec <= clipEndSec && f.confidence >= MIN_CONFIDENCE)
    .map((f) => ({ ...f, tSec: f.tSec - clipStartSec }))
    .sort((a, b) => a.tSec - b.tSec);
  if (inWindow.length === 0) return null;

  const merged = smoothFacesToKeyframes(inWindow, clipEndSec - clipStartSec, cropW, cropH);
  return merged.length > 1 ? merged : null; // a single unmoving keyframe = no better than static crop
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
): MultiSpeakerResult | null {
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

  const a = smoothFacesToKeyframes(left, duration, cropW, cropH);
  const b = smoothFacesToKeyframes(right, duration, cropW, cropH);
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
  const top = `[0:v]${cropAndScale(a)}[top]`;
  const bot = `[0:v]${cropAndScale(b)}[bot]`;

  const postStack = [moodFilter, captionsFilter].filter((f): f is string => !!f);
  const stacked = postStack.length > 0
    ? `[top][bot]vstack=inputs=2[stackedraw];[stackedraw]${postStack.join(",")}[video]`
    : `[top][bot]vstack=inputs=2[video]`;
  return `${top};${bot};${stacked}`;
}
