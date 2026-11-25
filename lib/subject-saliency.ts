// Where the action is in a clip with no face to frame.
//
// A faceless clip used to get a centre crop (and since 2026-11-24 the whole
// frame over a blurred fill, which never drops anything). Neither looks at
// the picture. This does, cheaply: a 64x36 luma thumbnail every half second,
// and per column, how much detail (edges) and change (motion) it carries.
// When that interest is concentrated — a person with their back to the
// camera, hands at work on a table, a car crossing — the crop goes there and
// holds. When it is spread across the frame — a screen recording's text, a
// game's HUD and scenery — no crop is right, and the caller keeps the whole
// frame.
//
// Horizontal only: it picks where a narrower window sits across a wider
// frame, which is the reframing AutoClip does (landscape into 9:16, 4:5, 1:1).

import { spawn } from "child_process";
import { ffmpegBin } from "@/utils/ffmpeg-render";
import { cropSizeFrac, type ReframeAspect } from "@/lib/reframe";

const TW = 64, TH = 36;
const FPS = 2;
/** The best window must hold this many times its fair (uniform) share of the interest. */
export const CONCENTRATION = 1.5;
/** Motion counts this much more than detail: a moving subject beats a busy background. */
const MOTION_WEIGHT = 2;

export interface SubjectBox { x: number; y: number; w: number; h: number }

/**
 * Per-column interest (detail + weighted motion) over thumbnails, normalised
 * to sum to 1. Exported for tests.
 */
export function columnInterest(frames: Uint8Array[], tw = TW, th = TH): Float64Array {
  const col = new Float64Array(tw);
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k], prev = k > 0 ? frames[k - 1] : null;
    for (let y = 1; y < th - 1; y++) {
      for (let x = 1; x < tw - 1; x++) {
        const i = y * tw + x;
        const edge = Math.abs(f[i + 1] - f[i - 1]) + Math.abs(f[i + tw] - f[i - tw]);
        const motion = prev ? Math.abs(f[i] - prev[i]) : 0;
        col[x] += edge + MOTION_WEIGHT * motion;
      }
    }
  }
  const total = col.reduce((a, b) => a + b, 0);
  if (total > 0) for (let x = 0; x < tw; x++) col[x] /= total;
  return col;
}

/**
 * The crop window (fractions) holding the most interest, or null when no
 * window holds clearly more than its share — then nothing should be cut.
 */
export function bestWindow(interest: Float64Array, windowFrac: number): SubjectBox | null {
  const n = interest.length;
  const k = Math.max(1, Math.round(windowFrac * n));
  if (k >= n) return null;
  let sum = 0;
  for (let i = 0; i < k; i++) sum += interest[i];
  let best = sum, at = 0;
  for (let i = k; i < n; i++) {
    sum += interest[i] - interest[i - k];
    if (sum > best) { best = sum; at = i - k + 1; }
  }
  if (best < Math.min(0.95, (k / n) * CONCENTRATION)) return null;
  return { x: at / n, y: 0, w: k / n, h: 1 };
}

/** Thumbnails of one window off an ffmpeg pipe. */
async function readThumbs(videoPath: string, start: number, end: number): Promise<Uint8Array[]> {
  const args = [
    "-v", "error", "-ss", start.toFixed(3), "-t", Math.max(0.5, end - start).toFixed(3), "-i", videoPath,
    "-an", "-sn", "-vf", `fps=${FPS},scale=${TW}:${TH}:flags=area,format=gray`, "-f", "rawvideo", "pipe:1",
  ];
  const proc = spawn(ffmpegBin!, args, { stdio: ["ignore", "pipe", "ignore"] });
  const chunks: Buffer[] = [];
  for await (const c of proc.stdout as AsyncIterable<Buffer>) chunks.push(c);
  const buf = Buffer.concat(chunks);
  const size = TW * TH;
  const out: Uint8Array[] = [];
  for (let o = 0; o + size <= buf.length; o += size) out.push(new Uint8Array(buf.subarray(o, o + size)));
  return out;
}

/**
 * Where to hold the crop for a faceless clip, as a box on the source frame,
 * or null for "show the whole frame". Never throws.
 */
export async function subjectBoxForWindow(
  videoPath: string,
  start: number,
  end: number,
  aspect: ReframeAspect,
  srcW: number,
  srcH: number,
): Promise<SubjectBox | null> {
  if (!ffmpegBin || !(srcW > 0 && srcH > 0)) return null;
  const { w, h } = cropSizeFrac(aspect, srcW, srcH);
  if (w >= 0.999 || h < 0.999) return null; // nothing to choose across the width
  try {
    const frames = await readThumbs(videoPath, start, end);
    if (frames.length < 2) return null;
    const box = bestWindow(columnInterest(frames), w);
    if (!box) return null;
    // The crop is cropSizeFrac's width exactly; the box only says where.
    const x = Math.min(1 - w, Math.max(0, box.x + box.w / 2 - w / 2));
    return { x, y: 0, w, h: 1 };
  } catch {
    return null;
  }
}
