// Text keyframes: where a text clip is, how big and how visible, at any time.
// One interpolation used by the live preview (textAt) and the export
// (keyframeExpr builds the same curve as an ffmpeg expression in t).
// Pure and client-safe.

import { MAX_TEXT_KEYFRAMES, type TextClip, type TextKeyframe } from "./types";

export type KeyframeProp = "x" | "y" | "scale" | "opacity";

/** The static values a clip has with no keyframes. */
export function baseState(clip: TextClip): Omit<TextKeyframe, "t"> {
  return { x: clip.x, y: clip.y, scale: 1, opacity: clip.opacity ?? 1 };
}

/** Interpolated state at clip-local time `local`. */
export function stateAt(clip: TextClip, local: number): Omit<TextKeyframe, "t"> {
  const kfs = clip.keyframes;
  if (!kfs || kfs.length === 0) return baseState(clip);
  if (local <= kfs[0].t) return { x: kfs[0].x, y: kfs[0].y, scale: kfs[0].scale, opacity: kfs[0].opacity };
  const last = kfs[kfs.length - 1];
  if (local >= last.t) return { x: last.x, y: last.y, scale: last.scale, opacity: last.opacity };
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (local >= a.t && local <= b.t) {
      const f = b.t > a.t ? (local - a.t) / (b.t - a.t) : 0;
      const lerp = (p: KeyframeProp) => a[p] + (b[p] - a[p]) * f;
      return { x: lerp("x"), y: lerp("y"), scale: lerp("scale"), opacity: lerp("opacity") };
    }
  }
  return baseState(clip);
}

/** The clip as it looks at timeline time `t` (for the preview). */
export function textAt(clip: TextClip, t: number): TextClip {
  if (!clip.keyframes || clip.keyframes.length === 0) return clip;
  const s = stateAt(clip, t - clip.timelineStart);
  return { ...clip, x: s.x, y: s.y, fontSizePct: clip.fontSizePct * s.scale, opacity: s.opacity };
}

/** Adds or replaces the keyframe at clip-local time `local` (within 1/30 s), keeping order and the cap. */
export function setKeyframe(clip: TextClip, local: number, patch: Partial<Omit<TextKeyframe, "t">> = {}): TextKeyframe[] {
  const t = Math.max(0, Math.min(clip.duration, Math.round(local * 1000) / 1000));
  const current = stateAt(clip, t);
  const kfs = (clip.keyframes ?? []).filter((k) => Math.abs(k.t - t) > 1 / 30);
  const next = [...kfs, { t, ...current, ...patch }].sort((a, b) => a.t - b.t);
  return next.slice(0, MAX_TEXT_KEYFRAMES);
}

export function removeKeyframe(clip: TextClip, t: number): TextKeyframe[] | undefined {
  const next = (clip.keyframes ?? []).filter((k) => Math.abs(k.t - t) > 1 / 30);
  return next.length > 0 ? next : undefined;
}

/**
 * ffmpeg expression for `prop` over ABSOLUTE timeline time t (what drawtext
 * sees after the concat), piecewise-linear like stateAt.
 */
export function keyframeExpr(clip: TextClip, prop: KeyframeProp, fmt: (n: number) => string | number = (n) => Math.round(n * 10000) / 10000): string {
  const kfs = clip.keyframes ?? [];
  if (kfs.length === 0) return String(fmt(baseState(clip)[prop]));
  const T = (k: TextKeyframe) => clip.timelineStart + k.t;
  let expr = String(fmt(kfs[kfs.length - 1][prop]));
  for (let i = kfs.length - 2; i >= 0; i--) {
    const a = kfs[i];
    const b = kfs[i + 1];
    const span = Math.max(1e-6, b.t - a.t);
    const seg = `${fmt(a[prop])}+(${fmt(b[prop] - a[prop])})*(t-${fmt(T(a))})/${fmt(span)}`;
    expr = `if(lt(t,${fmt(T(b))}),${seg},${expr})`;
  }
  return `if(lt(t,${fmt(T(kfs[0]))}),${fmt(kfs[0][prop])},${expr})`;
}
