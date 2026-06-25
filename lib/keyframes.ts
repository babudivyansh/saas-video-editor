// Keyframe sampling + FFmpeg expression generation. Pure functions shared by the
// preview canvas (live interpolation) and the render builder (time expressions).

import type { AnimatableParam, Keyframe, KeyframeMap } from "@/lib/track-editor-types";

// Smoothstep easing for natural motion between keyframes.
function ease(p: number): number {
  return p * p * (3 - 2 * p);
}

// Value of a single param's keyframe track at local time `t` (seconds from clip
// start). Returns `fallback` when there are no keyframes for that param.
export function sampleParam(kfs: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  const sorted = kfs.length > 1 ? [...kfs].sort((a, b) => a.t - b.t) : kfs;
  if (t <= sorted[0].t) return sorted[0].v;
  if (t >= sorted[sorted.length - 1].t) return sorted[sorted.length - 1].v;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1e-6;
      const p = ease((t - a.t) / span);
      return a.v + (b.v - a.v) * p;
    }
  }
  return fallback;
}

// Resolve all animatable params at local time `t`, overriding the static base.
export function sampleAnimatable(
  km: KeyframeMap | undefined,
  t: number,
  base: Record<AnimatableParam, number>,
): Record<AnimatableParam, number> {
  if (!km) return base;
  const out = { ...base };
  (Object.keys(base) as AnimatableParam[]).forEach(p => {
    out[p] = sampleParam(km[p], t, base[p]);
  });
  return out;
}

export function hasKeyframes(km: KeyframeMap | undefined): boolean {
  return !!km && Object.values(km).some(arr => arr && arr.length > 0);
}

// Insert/replace a keyframe for a param at time `t` (sorted, de-duped on t).
export function upsertKeyframe(km: KeyframeMap | undefined, param: AnimatableParam, t: number, v: number): KeyframeMap {
  const next: KeyframeMap = { ...(km ?? {}) };
  const arr = [...(next[param] ?? [])].filter(k => Math.abs(k.t - t) > 0.001);
  arr.push({ t, v });
  arr.sort((a, b) => a.t - b.t);
  next[param] = arr;
  return next;
}

export function removeKeyframesFor(km: KeyframeMap | undefined, param: AnimatableParam): KeyframeMap {
  const next: KeyframeMap = { ...(km ?? {}) };
  delete next[param];
  return next;
}

// Build an FFmpeg time-expression (for use in scale/rotate/overlay exprs) that
// reproduces a keyframe track. `t` is the FFmpeg timeline var. Render-only.
export function ffmpegExpr(kfs: Keyframe[] | undefined, fallback: number): string {
  if (!kfs || kfs.length === 0) return String(fallback);
  const sorted = [...kfs].sort((a, b) => a.t - b.t);
  // Nested if(): if(lt(t,t1), v0, if(lt(t,t2), lerp01, ... ))
  let expr = String(sorted[sorted.length - 1].v);
  for (let i = sorted.length - 2; i >= 0; i--) {
    const a = sorted[i], b = sorted[i + 1];
    const span = (b.t - a.t) || 1e-6;
    // linear lerp (ffmpeg has no smoothstep cheaply); good enough for render parity
    const lerp = `(${a.v}+(${b.v}-${a.v})*((t-${a.t})/${span}))`;
    expr = `if(lt(t,${a.t}),${a.v},if(lt(t,${b.t}),${lerp},${expr}))`;
  }
  return expr;
}
