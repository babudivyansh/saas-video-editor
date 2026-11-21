// Cinematic camera motion: turning the signal track into a zoom envelope.
//
// The difference between "auto-zoom" and "a camera operator" is almost
// entirely in the constraints, not the signal. A naive implementation zooms
// whenever the energy rises, which lands mid-word, reverses immediately, and
// reads as a glitch. What makes motion feel intentional:
//
//   * critically-damped spring response, so the move never overshoots and
//     never oscillates — this is the single biggest contributor;
//   * onsets snapped to pauses and shot boundaries, so a push-in starts where
//     a human editor would cut, not mid-syllable;
//   * a refractory period, so the camera does not pump on every loud word;
//   * stable framing at the very start and end of a clip, because the first
//     second is the hook and the last is the payoff.

import { sampleAt, SIGNAL_HZ, type SignalTrack } from "@/lib/signal-track";

export interface CameraMotionOptions {
  /** Peak additional zoom at full energy. */
  maxZoom?: number;
  /** Minimum seconds between the start of one push-in and the next. */
  refractorySec?: number;
  /** No zoom change within this many seconds of the clip start. */
  leadInSec?: number;
  /** No zoom change within this many seconds of the clip end. */
  leadOutSec?: number;
  /** Spring stiffness (rad/s). Higher = snappier. */
  omega?: number;
  /**
   * Punch-ins the AI edit plan asked for (lib/autoclip-ai/edit-plan.ts), on
   * the same timeline as the track. When present they LEAD: the energy track
   * only vetoes a planned push that lands on near-silence, and adds one of its
   * own only for a spike strong enough that the plan clearly missed it.
   */
  planned?: { tSec: number; strength: number; holdSec: number }[];
  /** Times the plan returns to normal framing; nothing pushes in for a beat after. */
  resets?: number[];
}

/** Energy below this at a planned push means the anchor landed on silence. */
const PLANNED_VETO_ENERGY = 0.1;
/** With a plan, an energy onset must be at least this strong to be added. */
const PLANNED_ENERGY_ONSET_MIN = 0.6;
/** How long a reset holds the camera wide. */
const RESET_HOLD_SEC = 1.5;

export const ZOOM_STRENGTH_MAX: Record<"low" | "medium" | "high", number> = {
  low: 1.06,
  medium: 1.14,
  high: 1.24, // hard ceiling: past ~1.3 a 1080p source visibly softens
};

const DEFAULTS: Required<Omit<CameraMotionOptions, "planned" | "resets">> = {
  maxZoom: ZOOM_STRENGTH_MAX.medium,
  refractorySec: 4,
  leadInSec: 0.8,
  leadOutSec: 0.5,
  omega: 4,
};

/**
 * Snap a time to the nearest pause or shot boundary within `windowSec`.
 * Falls back to the original time when there is nothing to snap to.
 */
export function snapToBeat(tSec: number, track: SignalTrack, windowSec = 0.4): number {
  let best = tSec;
  let bestDist = windowSec;
  for (const p of track.pauses) {
    // The middle of a pause is where a cut would land.
    const mid = (p.start + p.end) / 2;
    const d = Math.abs(mid - tSec);
    if (d < bestDist) { bestDist = d; best = mid; }
  }
  for (const s of track.scenes) {
    const d = Math.abs(s - tSec);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

/**
 * Target zoom per sample, before smoothing: the raw "where should the camera
 * be" signal, with the editorial constraints applied.
 */
export function buildZoomTargets(
  track: SignalTrack,
  durationSec: number,
  opts: CameraMotionOptions = {},
): number[] {
  const o = { ...DEFAULTS, ...opts };
  const n = Math.max(1, Math.round(durationSec * SIGNAL_HZ));
  const targets = new Array<number>(n).fill(1);
  const planned = (o.planned ?? []).filter((p) => p.tSec >= o.leadInSec && p.tSec <= durationSec - o.leadOutSec);
  const hasPlan = planned.length > 0;

  // Planned pushes: held for the plan's own duration, not for "while energy
  // stays high" — the plan knows where the thought ends, the envelope doesn't.
  for (const p of planned) {
    if (track.energy.length > 0 && sampleAt(track.energy, p.tSec) < PLANNED_VETO_ENERGY) continue;
    const startIdx = Math.max(0, Math.round(p.tSec * SIGNAL_HZ));
    const endT = Math.min(durationSec - o.leadOutSec, p.tSec + Math.max(0.5, p.holdSec));
    for (let i = startIdx; i < n && i / SIGNAL_HZ <= endT; i++) {
      targets[i] = Math.max(targets[i], 1 + (o.maxZoom - 1) * Math.min(1, Math.max(0, p.strength)));
    }
  }
  const applyResets = () => {
    for (const r of o.resets ?? []) {
      const from = Math.max(0, Math.round(r * SIGNAL_HZ));
      const to = Math.min(n, Math.round((r + RESET_HOLD_SEC) * SIGNAL_HZ));
      for (let i = from; i < to; i++) targets[i] = 1;
    }
  };
  if (track.energy.length === 0) {
    applyResets();
    return targets;
  }

  // Candidate push-ins: a sustained rise in energy above the clip's own
  // midpoint. Using a relative threshold means a consistently loud clip does
  // not sit permanently zoomed in.
  const sorted = [...track.energy].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.75)] ?? 1;
  const threshold = Math.max(median + 0.05, (median + high) / 2);

  let lastOnset = -Infinity;
  const onsets: { t: number; strength: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / SIGNAL_HZ;
    if (t < o.leadInSec || t > durationSec - o.leadOutSec) continue;
    const e = sampleAt(track.energy, t);
    if (e < threshold) continue;
    const snapped = snapToBeat(t, track);
    if (snapped - lastOnset < o.refractorySec) continue;
    const strength = Math.min(1, (e - threshold) / Math.max(0.05, 1 - threshold));
    if (hasPlan) {
      // The plan leads: only a clearly missed spike, clear of every planned push.
      if (strength < PLANNED_ENERGY_ONSET_MIN) continue;
      if (planned.some((p) => Math.abs(p.tSec - snapped) < o.refractorySec)) continue;
    }
    lastOnset = snapped;
    onsets.push({ t: snapped, strength });
  }

  // Each onset holds while energy stays elevated, then releases.
  for (const onset of onsets) {
    const startIdx = Math.max(0, Math.round(onset.t * SIGNAL_HZ));
    for (let i = startIdx; i < n; i++) {
      const t = i / SIGNAL_HZ;
      if (t > durationSec - o.leadOutSec) break;
      const e = sampleAt(track.energy, t);
      if (e < threshold * 0.8 && i > startIdx + SIGNAL_HZ) break; // released
      targets[i] = Math.max(targets[i], 1 + (o.maxZoom - 1) * onset.strength);
    }
  }

  applyResets();
  return targets;
}

/**
 * Resample a crop path at `hz`, keeping every original keyframe.
 *
 * applyZoomToKeyframes reads the zoom curve only AT keyframe times, and a
 * simplified path can have a few keyframes per clip — so a two-second punch-in
 * between two of them would simply never be applied. Two keyframes closer
 * than a frame are a deliberate cut (buildCutKeyframes, shot boundaries):
 * nothing is interpolated between them, so the jump stays a jump.
 */
export function densifyKeyframes<T extends { tSec: number; x: number; y: number; w: number; h: number }>(
  keyframes: T[],
  hz = 5,
): T[] {
  if (keyframes.length < 2) return keyframes;
  const sorted = [...keyframes].sort((a, b) => a.tSec - b.tSec);
  const step = 1 / hz;
  const out: T[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    out.push(a);
    const span = b.tSec - a.tSec;
    if (span <= 1 / 25) continue; // a cut
    for (let t = a.tSec + step; t < b.tSec - step / 2; t += step) {
      const f = (t - a.tSec) / span;
      out.push({
        ...a,
        tSec: t,
        x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f,
        w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f,
      });
    }
  }
  out.push(sorted[sorted.length - 1]);
  return out;
}

/**
 * Critically-damped spring integrator.
 *
 * A linear interpolation between targets produces constant-velocity moves that
 * start and stop abruptly. A spring at zeta = 1 accelerates in, decelerates
 * out, and — because it is critically damped rather than under-damped — is
 * mathematically incapable of overshooting, which is what guarantees "never
 * jitters, never abrupt" rather than merely hoping for it.
 */
export function springSmooth(targets: number[], hz = SIGNAL_HZ, omega = DEFAULTS.omega): number[] {
  const dt = 1 / hz;
  const out = new Array<number>(targets.length);
  let position = targets[0] ?? 1;
  let velocity = 0;

  for (let i = 0; i < targets.length; i++) {
    // x'' = -2*omega*x' - omega^2 * (x - target)
    const accel = -2 * omega * velocity - omega * omega * (position - targets[i]);
    velocity += accel * dt;
    position += velocity * dt;
    out[i] = position;
  }
  return out;
}

/**
 * The full zoom curve for a clip: targets, then spring, then a floor at 1
 * (zooming "out" past the framed window would show pixels the crop excluded).
 */
export function buildCameraZoom(
  track: SignalTrack,
  durationSec: number,
  opts: CameraMotionOptions = {},
): number[] {
  const o = { ...DEFAULTS, ...opts };
  const targets = buildZoomTargets(track, durationSec, o);
  return springSmooth(targets, SIGNAL_HZ, o.omega).map((v) => Math.max(1, Math.min(o.maxZoom, v)));
}

/**
 * Apply a zoom curve to an existing crop path, producing keyframes whose
 * window SIZE varies — which buildDynamicCropFilter renders through zoompan.
 *
 * The crop centre is preserved, so this composes with speaker tracking instead
 * of fighting it: the camera keeps following the subject and simply tightens
 * around them.
 */
export function applyZoomToKeyframes<T extends { tSec: number; x: number; y: number; w: number; h: number }>(
  keyframes: T[],
  zoomCurve: number[],
  hz = SIGNAL_HZ,
): T[] {
  if (zoomCurve.length === 0) return keyframes;
  return keyframes.map((k) => {
    const z = Math.max(1, sampleAt(zoomCurve, k.tSec, hz));
    const w = k.w / z;
    const h = k.h / z;
    // Keep the same centre, then clamp back inside the frame.
    const cx = k.x + k.w / 2;
    const cy = k.y + k.h / 2;
    return {
      ...k,
      w, h,
      x: Math.min(1 - w, Math.max(0, cx - w / 2)),
      y: Math.min(1 - h, Math.max(0, cy - h / 2)),
    };
  });
}
