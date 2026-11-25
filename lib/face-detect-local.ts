// Face detection and tracking on the server's own CPU — the default rung of
// the face timeline (lib/asd.ts resolves the others).
//
// Why this exists: production had no face detector (no GPU service, the
// Rekognition fallback is off for cost), and the Gemini rung that replaced it
// looks at one frame every few seconds of the WHOLE source, with no identity
// per person. On a multi-camera podcast that missed short shots, mixed people
// up across camera angles and took ~3 minutes per run (2026-11-24 audit).
//
// This runs YuNet (OpenCV Model Zoo, MIT, 232 KB) through onnxruntime-web's
// WebAssembly build — no native binary for the Hostinger build to break on —
// over the chosen clip windows only, a few frames a second:
//
//   * frames come straight off an ffmpeg pipe (no temp files to leak);
//   * two frames are tiled into each 640x640 input (the model's fixed size),
//     so a 16:9 frame doesn't waste 44% of every inference on padding;
//   * shot cuts are found from the same frames (thumbnail change), and every
//     track ends at a cut: a host in one angle and a guest in the next must
//     never share an identity just because they sit at the same place;
//   * a greedy IoU tracker gives each person a track id, which is what the
//     reframe and scene code use for "who is who" once ids exist.
//
// Everything is best-effort: a failure returns `failure` and the resolver
// falls back to the next rung.

import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { logger } from "@/lib/logger";
import type { FaceBox, FaceTimelineResult } from "@/lib/reframe";

/** Frames per second sampled inside each window. */
export const DETECT_FPS = 4;
/** The model's fixed input. */
const NET = 640;
/** A detection must score at least this (0..1). */
export const SCORE_THRESHOLD = 0.6;
const NMS_IOU = 0.3;
const TOP_K = 30;
/** A track survives this long without a matching detection (occlusion, a look away). */
const TRACK_GAP_SEC = 1.5;
const MATCH_IOU = 0.2;
/** Mean absolute change of a 32x18 luma thumbnail (0..255) that marks a hard cut. */
export const CUT_THUMB_DIFF = 28;
/** A whole run of local detection gets this long before it gives up. */
const DETECT_BUDGET_MS = 6 * 60_000;

export const YUNET_MODEL_PATH = path.join(process.cwd(), "vendor", "models", "yunet", "face_detection_yunet_2023mar.onnx");

export interface Window { start: number; end: number }

/** A raw detection in source-frame fractions, with YuNet's five landmarks. */
export interface Detection {
  x: number; y: number; w: number; h: number;
  score: number;
  /** right eye, left eye, nose, right mouth corner, left mouth corner — (x, y) fractions. */
  kps: number[];
  /** Luma patches around the mouth and the whole face, for mouth movement (attachPatches). */
  mouth?: Float32Array;
  face?: Float32Array;
}

// ── Tiling ─────────────────────────────────────────────────────────────────

/**
 * How frames are laid into the 640x640 input: two landscape frames one above
 * the other, two portrait frames side by side, one squarish frame alone.
 * Each frame keeps its aspect inside its tile, anchored top-left.
 */
export function tileLayout(srcW: number, srcH: number): { cols: number; rows: number; fw: number; fh: number } {
  const ar = srcW / srcH;
  const [cols, rows] = ar >= 1.4 ? [1, 2] : ar <= 1 / 1.4 ? [2, 1] : [1, 1];
  const tw = NET / cols, th = NET / rows;
  const s = Math.min(tw / srcW, th / srcH);
  // Even sizes: ffmpeg's scaler and bgr24 rows are simpler that way.
  const fw = Math.max(2, Math.floor((srcW * s) / 2) * 2);
  const fh = Math.max(2, Math.floor((srcH * s) / 2) * 2);
  return { cols, rows, fw, fh };
}

// ── YuNet output decoding ──────────────────────────────────────────────────

type Outputs = Record<string, { data: ArrayLike<number> }>;

function iou(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const uni = a.w * a.h + b.w * b.h - inter;
  return uni > 0 ? inter / uni : 0;
}

/**
 * YuNet's raw heads → boxes in 640x640 input pixels, after score threshold and
 * NMS. Same decoding as OpenCV's FaceDetectorYN: per stride, each grid cell
 * predicts an offset from its corner, log-size, and five landmark offsets;
 * score = sqrt(cls * obj).
 */
export function decodeYunet(out: Outputs, threshold = SCORE_THRESHOLD): Detection[] {
  const raw: Detection[] = [];
  for (const stride of [8, 16, 32]) {
    const cols = NET / stride;
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data;
    const bbox = out[`bbox_${stride}`].data, kps = out[`kps_${stride}`].data;
    const n = cls.length;
    for (let i = 0; i < n; i++) {
      const c = Math.min(1, Math.max(0, cls[i])), o = Math.min(1, Math.max(0, obj[i]));
      const score = Math.sqrt(c * o);
      if (score < threshold) continue;
      const r = Math.floor(i / cols), col = i % cols;
      const cx = (col + bbox[i * 4]) * stride, cy = (r + bbox[i * 4 + 1]) * stride;
      const w = Math.exp(bbox[i * 4 + 2]) * stride, h = Math.exp(bbox[i * 4 + 3]) * stride;
      const k: number[] = [];
      for (let j = 0; j < 5; j++) k.push((col + kps[i * 10 + j * 2]) * stride, (r + kps[i * 10 + j * 2 + 1]) * stride);
      raw.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, kps: k });
    }
  }
  raw.sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const d of raw) {
    if (kept.length >= TOP_K) break;
    if (kept.every((k) => iou(k, d) <= NMS_IOU)) kept.push(d);
  }
  return kept;
}

/** Detections in input pixels → per-tile lists in source-frame fractions. */
export function splitTiles(
  dets: Detection[],
  layout: { cols: number; rows: number; fw: number; fh: number },
): Detection[][] {
  const { cols, rows, fw, fh } = layout;
  const tw = NET / cols, th = NET / rows;
  const tiles: Detection[][] = Array.from({ length: cols * rows }, () => []);
  for (const d of dets) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    const tc = Math.min(cols - 1, Math.floor(cx / tw)), tr = Math.min(rows - 1, Math.floor(cy / th));
    const ox = tc * tw, oy = tr * th;
    // A centre in the padding (right of / below the frame) is not a face on it.
    if (cx - ox > fw || cy - oy > fh) continue;
    const fx = (v: number) => Math.min(1, Math.max(0, (v - ox) / fw));
    const fy = (v: number) => Math.min(1, Math.max(0, (v - oy) / fh));
    const x0 = fx(d.x), y0 = fy(d.y), x1 = fx(d.x + d.w), y1 = fy(d.y + d.h);
    if (x1 - x0 <= 0 || y1 - y0 <= 0) continue;
    const kps = d.kps.map((v, i) => (i % 2 === 0 ? fx(v) : fy(v)));
    tiles[tr * cols + tc].push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, score: d.score, kps });
  }
  return tiles;
}

/**
 * Head turn from the landmarks, in degrees, on the reframe code's convention
 * (lib/reframe.ts look-room: the crop shifts AGAINST yaw). Negative = the
 * face points toward the viewer's right. Coarse — the nose's offset from the
 * eye midpoint over the eye distance — but only its sign and rough size are
 * used, and it is clamped.
 */
export function yawFromLandmarks(kps: number[], srcW: number, srcH: number): number | undefined {
  if (kps.length < 6) return undefined;
  const ex = (kps[0] + kps[2]) / 2 * srcW;
  const eyeDist = Math.hypot((kps[2] - kps[0]) * srcW, (kps[3] - kps[1]) * srcH);
  if (eyeDist < 2) return undefined;
  const ratio = (kps[4] * srcW - ex) / eyeDist;
  return Math.max(-60, Math.min(60, -ratio * 90));
}

// ── Cuts and tracking ──────────────────────────────────────────────────────

const THUMB_W = 32, THUMB_H = 18;

/** A 32x18 luma thumbnail of one bgr24 frame (fw x fh), box-averaged. */
export function lumaThumb(frame: Uint8Array, fw: number, fh: number): Float32Array {
  const out = new Float32Array(THUMB_W * THUMB_H);
  const cnt = new Uint16Array(THUMB_W * THUMB_H);
  for (let y = 0; y < fh; y += 2) {
    const ty = Math.min(THUMB_H - 1, Math.floor((y / fh) * THUMB_H));
    for (let x = 0; x < fw; x += 2) {
      const tx = Math.min(THUMB_W - 1, Math.floor((x / fw) * THUMB_W));
      const p = (y * fw + x) * 3;
      out[ty * THUMB_W + tx] += 0.114 * frame[p] + 0.587 * frame[p + 1] + 0.299 * frame[p + 2];
      cnt[ty * THUMB_W + tx]++;
    }
  }
  for (let i = 0; i < out.length; i++) out[i] /= Math.max(1, cnt[i]);
  return out;
}

export function thumbDiff(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// ── Mouth movement ─────────────────────────────────────────────────────────

const PATCH_W = 12, PATCH_H = 8, FACE_PATCH = 12;

/** Nearest-neighbour luma samples of a rectangle (frame fractions) of a bgr24 frame. */
function samplePatch(frame: Uint8Array, fw: number, fh: number, x: number, y: number, w: number, h: number, pw: number, ph: number): Float32Array {
  const out = new Float32Array(pw * ph);
  for (let j = 0; j < ph; j++) {
    const py = Math.min(fh - 1, Math.max(0, Math.round((y + ((j + 0.5) / ph) * h) * fh)));
    for (let i = 0; i < pw; i++) {
      const px = Math.min(fw - 1, Math.max(0, Math.round((x + ((i + 0.5) / pw) * w) * fw)));
      const p = (py * fw + px) * 3;
      out[j * pw + i] = 0.114 * frame[p] + 0.587 * frame[p + 1] + 0.299 * frame[p + 2];
    }
  }
  return out;
}

/**
 * Attach the mouth and face patches each detection needs for mouth movement,
 * while its frame is still in memory. The mouth box spans the two mouth-corner
 * landmarks, widened, from just above the lips to the chin.
 */
export function attachPatches(dets: Detection[], frame: Uint8Array, fw: number, fh: number): void {
  for (const d of dets) {
    d.face = samplePatch(frame, fw, fh, d.x, d.y, d.w, d.h, FACE_PATCH, FACE_PATCH);
    if (d.kps.length < 10) continue;
    const mx = (d.kps[6] + d.kps[8]) / 2, my = (d.kps[7] + d.kps[9]) / 2;
    const mw = Math.max(Math.abs(d.kps[8] - d.kps[6]) * 1.8, d.w * 0.4);
    const mh = d.h * 0.32;
    d.mouth = samplePatch(frame, fw, fh, mx - mw / 2, my - mh * 0.4, mw, mh, PATCH_W, PATCH_H);
  }
}

function meanAbsDiff(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

function contrast(a: Float32Array): number {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / a.length);
}

/**
 * How much the mouth changed between two samples of one face, net of the
 * whole face moving (a nod or a head turn changes the mouth patch too), in
 * units of the mouth patch's own contrast so lighting doesn't decide it.
 */
export function mouthMotion(prev: Detection, cur: Detection): number | undefined {
  if (!prev.mouth || !cur.mouth || !prev.face || !cur.face) return undefined;
  const m = meanAbsDiff(prev.mouth, cur.mouth);
  const f = meanAbsDiff(prev.face, cur.face);
  const c = (contrast(prev.mouth) + contrast(cur.mouth)) / 2;
  return Math.max(0, m - 0.6 * f) / (c + 6);
}

interface Track { id: string; last: Detection; lastT: number }

/**
 * Greedy IoU tracker over one window's frames. Every track ends at a cut.
 * Returns FaceBox samples (source fractions, absolute seconds) with track ids.
 */
export function trackWindow(
  frames: { t: number; dets: Detection[]; cut: boolean }[],
  idPrefix: string,
  srcW: number,
  srcH: number,
): FaceBox[] {
  const out: FaceBox[] = [];
  let active: Track[] = [];
  let next = 0;
  for (const f of frames) {
    if (f.cut) active = [];
    active = active.filter((tr) => f.t - tr.lastT <= TRACK_GAP_SEC);
    const pairs: { tr: Track; d: Detection; s: number }[] = [];
    for (const tr of active) for (const d of f.dets) {
      const s = iou(tr.last, d);
      if (s >= MATCH_IOU) pairs.push({ tr, d, s });
    }
    pairs.sort((a, b) => b.s - a.s);
    const usedT = new Set<Track>(), usedD = new Set<Detection>();
    const assign = new Map<Detection, Track>();
    for (const p of pairs) {
      if (usedT.has(p.tr) || usedD.has(p.d)) continue;
      usedT.add(p.tr); usedD.add(p.d); assign.set(p.d, p.tr);
    }
    for (const d of f.dets) {
      let tr = assign.get(d);
      const motion = tr && f.t - tr.lastT <= 0.6 ? mouthMotion(tr.last, d) : undefined;
      if (!tr) { tr = { id: `${idPrefix}${next++}`, last: d, lastT: f.t }; active.push(tr); }
      tr.last = d; tr.lastT = f.t;
      const yaw = yawFromLandmarks(d.kps, srcW, srcH);
      out.push({
        tSec: Math.round(f.t * 1000) / 1000,
        x: d.x, y: d.y, w: d.w, h: d.h,
        confidence: Math.round(d.score * 100),
        trackId: tr.id,
        ...(yaw !== undefined ? { yaw } : {}),
        ...(motion !== undefined ? { mouthMotion: Math.round(motion * 1000) / 1000 } : {}),
      });
    }
  }
  return out;
}

// ── Windows ────────────────────────────────────────────────────────────────

/** Clip windows padded by `padSec` and merged where they overlap, clamped to the source. */
export function mergeWindows(windows: Window[], durationSec: number, padSec = 3): Window[] {
  const padded = windows
    .map((w) => ({ start: Math.max(0, w.start - padSec), end: Math.min(durationSec, w.end + padSec) }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);
  const out: Window[] = [];
  for (const w of padded) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

// ── Runtime ────────────────────────────────────────────────────────────────

type Ort = typeof import("onnxruntime-web");
type Session = import("onnxruntime-web").InferenceSession;
const g = globalThis as { __yunet?: Promise<{ ort: Ort; session: Session }> };

async function loadModel(): Promise<{ ort: Ort; session: Session }> {
  g.__yunet ??= (async () => {
    const ort = await import("onnxruntime-web");
    // One thread: ffmpeg is capped per plan (lib/ffmpeg-threads) and shares
    // these cores; a worker pool here would undo that.
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(fs.readFileSync(YUNET_MODEL_PATH));
    return { ort, session };
  })().catch((err) => { g.__yunet = undefined; throw err; });
  return g.__yunet;
}

/** Whether the model file shipped with this build. */
export function localDetectorAvailable(): boolean {
  return fs.existsSync(YUNET_MODEL_PATH);
}

/** Streams bgr24 frames of one window off an ffmpeg pipe. */
async function* readFrames(videoPath: string, win: Window, fw: number, fh: number, fps: number): AsyncGenerator<{ t: number; frame: Uint8Array }> {
  const args = [
    "-v", "error", "-ss", win.start.toFixed(3), "-t", (win.end - win.start).toFixed(3), "-i", videoPath,
    "-an", "-sn", "-vf", `fps=${fps},scale=${fw}:${fh}:flags=area`,
    "-f", "rawvideo", "-pix_fmt", "bgr24", "pipe:1",
  ];
  const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (c: Buffer) => { if (stderr.length < 4000) stderr += c.toString(); });
  const size = fw * fh * 3;
  let buf: Buffer = Buffer.alloc(0);
  let i = 0;
  try {
    for await (const chunk of proc.stdout as AsyncIterable<Buffer>) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= size) {
        yield { t: win.start + i / fps, frame: new Uint8Array(buf.subarray(0, size)) };
        buf = buf.subarray(size);
        i++;
      }
    }
  } finally {
    if (proc.exitCode === null) proc.kill("SIGKILL");
  }
  const code: number | null = proc.exitCode ?? await new Promise<number | null>((r) => proc.once("close", r));
  if (code !== 0 && i === 0) throw new Error(`ffmpeg frame read failed (${code}): ${stderr.slice(0, 300)}`);
}

/** Writes frames into the NCHW float input at their tile positions. */
function fillInput(input: Float32Array, frames: Uint8Array[], layout: { cols: number; rows: number; fw: number; fh: number }): void {
  input.fill(0);
  const { cols, fw, fh } = layout;
  const tw = NET / cols, th = NET / layout.rows;
  const plane = NET * NET;
  frames.forEach((frame, k) => {
    const ox = (k % cols) * tw, oy = Math.floor(k / cols) * th;
    for (let y = 0; y < fh; y++) {
      const row = (oy + y) * NET + ox;
      for (let x = 0; x < fw; x++) {
        const p = (y * fw + x) * 3, q = row + x;
        input[q] = frame[p];             // B
        input[plane + q] = frame[p + 1]; // G
        input[2 * plane + q] = frame[p + 2]; // R
      }
    }
  });
}

/**
 * Faces with track ids over the given clip windows of a local source file.
 * `failure` is set only when detection could not run, never for "no faces".
 */
export async function detectFacesLocal(
  videoPath: string,
  windows: Window[],
  durationSec: number,
  srcW: number,
  srcH: number,
  fps = DETECT_FPS,
): Promise<FaceTimelineResult> {
  if (!localDetectorAvailable() || !ffmpegBin || !(srcW > 0 && srcH > 0)) return { boxes: [], failure: "unconfigured" };
  const merged = mergeWindows(windows, durationSec);
  if (merged.length === 0) return { boxes: [] };
  const t0 = Date.now();
  try {
    const { ort, session } = await loadModel();
    const layout = tileLayout(srcW, srcH);
    const perInput = layout.cols * layout.rows;
    const input = new Float32Array(3 * NET * NET);
    const boxes: FaceBox[] = [];
    let frameCount = 0, cuts = 0;

    for (let wi = 0; wi < merged.length; wi++) {
      const frames: { t: number; dets: Detection[]; cut: boolean }[] = [];
      let pending: { t: number; frame: Uint8Array; cut: boolean }[] = [];
      let prevThumb: Float32Array | null = null;
      const flush = async () => {
        if (pending.length === 0) return;
        fillInput(input, pending.map((p) => p.frame), layout);
        const out = await session.run({ input: new ort.Tensor("float32", input, [1, 3, NET, NET]) });
        const tiles = splitTiles(decodeYunet(out as unknown as Outputs), layout);
        pending.forEach((p, k) => {
          attachPatches(tiles[k], p.frame, layout.fw, layout.fh);
          frames.push({ t: p.t, dets: tiles[k], cut: p.cut });
        });
        pending = [];
      };
      for await (const { t, frame } of readFrames(videoPath, merged[wi], layout.fw, layout.fh, fps)) {
        if (Date.now() - t0 > DETECT_BUDGET_MS) throw new Error("local face detection ran out of time");
        const thumb = lumaThumb(frame, layout.fw, layout.fh);
        const cut = prevThumb !== null && thumbDiff(prevThumb, thumb) > CUT_THUMB_DIFF;
        if (cut) cuts++;
        prevThumb = thumb;
        pending.push({ t, frame, cut });
        frameCount++;
        if (pending.length === perInput) await flush();
      }
      await flush();
      boxes.push(...trackWindow(frames, `w${wi}-`, srcW, srcH));
    }
    boxes.sort((a, b) => a.tSec - b.tSec);
    logger.info("face-local", `${boxes.length} face samples from ${frameCount} frames, ${cuts} cuts, ${merged.length} windows in ${Math.round((Date.now() - t0) / 1000)}s`);
    return { boxes };
  } catch (err) {
    logger.warn("face-local", "local face detection failed, falling back", err);
    return { boxes: [], failure: "error" };
  }
}
