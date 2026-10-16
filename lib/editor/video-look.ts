// A video clip's look beyond the presets: colour fine-tune, and an effect
// limited to part of the clip and/or blended in at less than full strength.
// One description for the preview (CSS) and the export (ffmpeg). Pure.

import { NEUTRAL_ADJUST, type VideoAdjust, type VideoClip } from "./types";

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

export function isNeutral(a: VideoAdjust | undefined): boolean {
  if (!a) return true;
  return a.brightness === 0 && a.contrast === 1 && a.saturation === 1 && a.warmth === 0;
}

/** ffmpeg filters for the fine-tune (empty when neutral). */
export function adjustFilters(a: VideoAdjust | undefined): string[] {
  if (!a || isNeutral(a)) return [];
  const out: string[] = [];
  if (a.brightness !== 0 || a.contrast !== 1 || a.saturation !== 1) {
    out.push(`eq=brightness=${fmt(a.brightness)}:contrast=${fmt(a.contrast)}:saturation=${fmt(a.saturation)}`);
  }
  if (a.warmth !== 0) {
    const k = a.warmth * 0.15;
    out.push(`colorbalance=rs=${fmt(k)}:gs=${fmt(k * 0.15)}:bs=${fmt(-k)}`);
  }
  return out;
}

/** CSS filter approximating the fine-tune (empty when neutral). */
export function adjustCss(a: VideoAdjust | undefined): string {
  if (!a || isNeutral(a)) return "";
  const parts = [`brightness(${fmt(1 + a.brightness)})`, `contrast(${fmt(a.contrast)})`, `saturate(${fmt(a.saturation)})`];
  if (a.warmth > 0) parts.push(`sepia(${fmt(a.warmth * 0.35)})`);
  if (a.warmth < 0) parts.push(`hue-rotate(${fmt(a.warmth * 12)}deg)`);
  return parts.join(" ");
}

export function withAdjust(a: VideoAdjust | undefined, patch: Partial<VideoAdjust>): VideoAdjust {
  return { ...NEUTRAL_ADJUST, ...(a ?? {}), ...patch };
}

/** The effect's window in clip-local seconds. */
export function effectWindow(clip: VideoClip): { start: number; end: number; whole: boolean } {
  const whole = clip.effectStart === undefined && clip.effectEnd === undefined;
  const start = Math.max(0, clip.effectStart ?? 0);
  const end = Math.min(clip.duration, clip.effectEnd ?? clip.duration);
  return { start, end, whole: whole || (start <= 0 && end >= clip.duration) };
}

/** Is the effect showing at clip-local time `local`? (preview) */
export function effectActiveAt(clip: VideoClip, local: number): boolean {
  if (!clip.effect || clip.effect === "none") return false;
  const w = effectWindow(clip);
  return local >= w.start && local < w.end;
}

/**
 * Wraps the effect so it only shows in its window and at its strength. Returns
 * a filter_complex fragment `[in]…[out]`. Full strength + whole clip needs no
 * wrapping (callers use the plain chain).
 */
export function wrappedEffect(effectChain: string, clip: VideoClip, inLabel: string, outLabel: string, tag: string): string {
  const w = effectWindow(clip);
  const strength = clip.effectStrength ?? 1;
  const enable = w.whole ? "" : `:enable='between(t,${fmt(w.start)},${fmt(w.end)})'`;
  const mix = strength >= 1 ? "B" : `A+(B-A)*${fmt(strength)}`;
  return `${inLabel}split[${tag}o][${tag}f];[${tag}f]${effectChain}[${tag}e];[${tag}o][${tag}e]blend=all_expr='${mix}'${enable}${outLabel}`;
}

export function needsWrapping(clip: VideoClip): boolean {
  return !effectWindow(clip).whole || (clip.effectStrength ?? 1) < 1;
}
