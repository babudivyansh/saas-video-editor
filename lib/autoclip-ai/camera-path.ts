// Stage 5 — a camera path that behaves like an operator, not a tracker.
//
// A tracker moves whenever the subject moves. An operator holds the frame
// while the subject stays comfortably inside it, moves only when they drift
// out of a central safe zone, eases into and out of that move, and never
// whips. That is the whole algorithm (the same idea as AutoFlip's
// stabilised-camera mode), done per axis on the crop centre:
//
//   * dead zone: no motion while the target is within it;
//   * hysteresis: once moving, keep going until the target is well inside,
//     so the camera doesn't stop-start at the zone's edge;
//   * speed and acceleration limits, so every move eases in and out.
//
// Deterministic and pure: the same input always gives the same path.

import type { CropKeyframe } from "@/lib/reframe";

export interface CameraPathOptions {
  /** Half-width of the no-motion zone, as a fraction of the crop size. */
  deadZoneFrac: number;
  /** Fastest the crop centre may move, in frame fractions per second. */
  maxSpeed: number;
  /** Fastest it may change speed, in frame fractions per second squared. */
  maxAccel: number;
  /** Output keyframe rate. */
  hz: number;
}

export const CAMERA_PATH_DEFAULTS: CameraPathOptions = { deadZoneFrac: 0.18, maxSpeed: 0.3, maxAccel: 0.9, hz: 10 };

/**
 * The user's existing Smoothness / Tracking speed sliders (0-100) mapped onto
 * the solver, so the UI needs nothing new: smoother = bigger dead zone,
 * faster tracking = higher speed limit.
 */
export function cameraPathOptionsFor(smoothness = 50, trackingSpeed = 50): CameraPathOptions {
  const s = Math.min(100, Math.max(0, smoothness)) / 100;
  const t = Math.min(100, Math.max(0, trackingSpeed)) / 100;
  return {
    deadZoneFrac: 0.08 + 0.2 * s,
    maxSpeed: 0.12 + 0.45 * t,
    maxAccel: 0.4 + 1.2 * t,
    hz: 10,
  };
}

/** Linear sample of a target series at time t (holds the ends). */
function sampleTarget(samples: { t: number; v: number }[], t: number): number {
  if (t <= samples[0].t) return samples[0].v;
  const last = samples[samples.length - 1];
  if (t >= last.t) return last.v;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = samples[lo], b = samples[hi];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return a.v + (b.v - a.v) * f;
}

/** One axis. `half` is half the crop size on that axis; the centre stays in [half, 1-half]. */
export function solveAxis(
  targets: { t: number; v: number }[],
  durationSec: number,
  half: number,
  cropSize: number,
  opts: CameraPathOptions,
): number[] {
  const n = Math.max(2, Math.round(durationSec * opts.hz) + 1);
  const dt = 1 / opts.hz;
  const lo = half, hi = 1 - half;
  const clamp = (x: number) => Math.min(hi, Math.max(lo, x));
  if (targets.length === 0 || hi <= lo) return new Array<number>(n).fill(clamp(0.5));

  const dead = opts.deadZoneFrac * cropSize;
  const settle = dead * 0.3;
  let c = clamp(targets[0].v);
  let v = 0;
  let moving = false;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const target = clamp(sampleTarget(targets, t));
    const err = target - c;
    if (!moving && Math.abs(err) > dead) moving = true;
    if (moving && Math.abs(err) < settle) moving = false;

    let want = 0;
    if (moving) {
      // Proportional approach, capped at maxSpeed, and slowed by the braking
      // distance so the move decelerates into place instead of overshooting.
      const brake = Math.sqrt(2 * opts.maxAccel * Math.abs(err));
      want = Math.sign(err) * Math.min(opts.maxSpeed, brake, Math.abs(err) * 3);
    }
    const dv = Math.max(-opts.maxAccel * dt, Math.min(opts.maxAccel * dt, want - v));
    v += dv;
    c = clamp(c + v * dt);
    if (c === lo || c === hi) v = 0;
    out.push(c);
  }
  return out;
}

/**
 * A crop path that keeps `samples` (subject boxes or existing keyframes, as
 * centres) framed. `w`/`h` is the crop window size. Returns keyframes at
 * opts.hz from 0 to durationSec.
 */
export function solveCameraPath(
  samples: { t: number; cx: number; cy: number }[],
  durationSec: number,
  w: number,
  h: number,
  opts: CameraPathOptions = CAMERA_PATH_DEFAULTS,
): CropKeyframe[] {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const xs = solveAxis(sorted.map((s) => ({ t: s.t, v: s.cx })), durationSec, w / 2, w, opts);
  const ys = solveAxis(sorted.map((s) => ({ t: s.t, v: s.cy })), durationSec, h / 2, h, opts);
  return xs.map((cx, i) => ({
    tSec: Math.min(durationSec, i / opts.hz),
    x: cx - w / 2,
    y: ys[i] - h / 2,
    w,
    h,
  }));
}

/** Split a keyframe list at its deliberate cuts (two keyframes under a frame apart). */
export function splitAtCuts(keyframes: CropKeyframe[]): CropKeyframe[][] {
  const runs: CropKeyframe[][] = [];
  let cur: CropKeyframe[] = [];
  for (let i = 0; i < keyframes.length; i++) {
    const k = keyframes[i];
    const prev = keyframes[i - 1];
    if (prev && k.tSec - prev.tSec <= 1 / 25 && (Math.abs(k.x - prev.x) > 1e-3 || Math.abs(k.y - prev.y) > 1e-3)) {
      runs.push(cur);
      cur = [];
    }
    cur.push(k);
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 0);
}

/**
 * Re-solve an existing single-crop path run by run, keeping its cuts. Each run
 * keeps its own crop SIZE (a zoomed run stays zoomed); only the centre path is
 * replaced. Runs shorter than a second are kept as they are.
 */
export function smoothKeyframePath(keyframes: CropKeyframe[], opts: CameraPathOptions): CropKeyframe[] {
  if (keyframes.length < 3) return keyframes;
  const runs = splitAtCuts([...keyframes].sort((a, b) => a.tSec - b.tSec));
  const out: CropKeyframe[] = [];
  for (const run of runs) {
    const t0 = run[0].tSec, t1 = run[run.length - 1].tSec;
    if (t1 - t0 < 1 || run.length < 2) { out.push(...run); continue; }
    // Solve the centre against the LARGEST window in the run (so every size
    // stays inside the frame), then put each moment's own size back.
    const w = Math.max(...run.map((k) => k.w)), h = Math.max(...run.map((k) => k.h));
    const sizeW = run.map((k) => ({ t: k.tSec, v: k.w }));
    const sizeH = run.map((k) => ({ t: k.tSec, v: k.h }));
    const solved = solveCameraPath(
      run.map((k) => ({ t: k.tSec - t0, cx: k.x + k.w / 2, cy: k.y + k.h / 2 })),
      t1 - t0, w, h, opts,
    ).map((k) => {
      const t = k.tSec + t0;
      const kw = sampleTarget(sizeW, t), kh = sampleTarget(sizeH, t);
      const cx = k.x + w / 2, cy = k.y + h / 2;
      return {
        tSec: t, w: kw, h: kh,
        x: Math.min(1 - kw, Math.max(0, cx - kw / 2)),
        y: Math.min(1 - kh, Math.max(0, cy - kh / 2)),
      };
    });
    out.push(...solved);
  }
  return out;
}
