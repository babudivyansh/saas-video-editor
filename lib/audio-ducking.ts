// Auto audio ducking: given when speech is present, produce a music-volume
// envelope that dips under the voice (with attack/release ramps). Pure + tested;
// the render audio graph turns these segments into FFmpeg volume `enable` exprs.

export interface DuckSegment { start: number; end: number; gain: number } // seconds, linear gain

export interface DuckOptions {
  duckGain?: number;   // music level during speech (0–1), default 0.18
  fullGain?: number;   // music level when no speech, default 1
  attack?: number;     // seconds before speech to start ducking
  release?: number;    // seconds after speech to recover
  minGap?: number;     // merge speech islands closer than this
}

// Merge overlapping/near speech ranges, padded by attack/release.
function expandAndMerge(ranges: { start: number; end: number }[], attack: number, release: number, minGap: number) {
  const padded = ranges
    .filter(r => r.end > r.start)
    .map(r => ({ start: Math.max(0, r.start - attack), end: r.end + release }))
    .sort((a, b) => a.start - b.start);
  const out: { start: number; end: number }[] = [];
  for (const r of padded) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + minGap) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// Returns the music gain envelope across [0, totalDuration] as constant-gain
// segments (ducked under speech, full elsewhere).
export function computeDuckEnvelope(
  speechRanges: { start: number; end: number }[],
  totalDuration: number,
  opts: DuckOptions = {},
): DuckSegment[] {
  const duckGain = opts.duckGain ?? 0.18;
  const fullGain = opts.fullGain ?? 1;
  const speech = expandAndMerge(speechRanges, opts.attack ?? 0.25, opts.release ?? 0.4, opts.minGap ?? 0.3);

  const segs: DuckSegment[] = [];
  let cursor = 0;
  for (const r of speech) {
    const s = Math.max(0, Math.min(r.start, totalDuration));
    const e = Math.max(0, Math.min(r.end, totalDuration));
    if (s > cursor) segs.push({ start: cursor, end: s, gain: fullGain });
    if (e > s) segs.push({ start: s, end: e, gain: duckGain });
    cursor = Math.max(cursor, e);
  }
  if (cursor < totalDuration) segs.push({ start: cursor, end: totalDuration, gain: fullGain });
  return segs;
}

// Build an FFmpeg volume expression from the envelope (render-only).
// e.g. volume='if(between(t,0,2),1,if(between(t,2,5),0.18,1))':eval=frame
export function duckVolumeExpr(segs: DuckSegment[], fallback = 1): string {
  if (segs.length === 0) return String(fallback);
  let expr = String(fallback);
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    expr = `if(between(t,${s.start.toFixed(3)},${s.end.toFixed(3)}),${s.gain},${expr})`;
  }
  return expr;
}

// ── The one way a render mixes a music bed under speech ───────────────────────
//
// Three pipelines (reddit-video, text-video, the split-screen renderer in
// utils/ffmpeg-render.ts) each hardcoded `volume=0.12` — a flat level chosen so
// the bed never fights the voice, which also means the bed is inaudible for the
// whole video, including the gaps where it is the only thing playing. AutoClip
// lite was the sole caller of the envelope builder above.
//
// `fullGain` is 0.35, not 1. The plan called for 1 on the grounds that 0.12 is
// the level users already hear during speech, so nothing gets quieter; but a
// bed at unity between sentences is not "audible", it is louder than the voice
// that follows it. 0.35 is roughly a third down — clearly present in a gap,
// clearly behind the speaker.
const FLAT_MUSIC_GAIN = 0.12;
const FULL_MUSIC_GAIN = 0.35;

/**
 * The FFmpeg `volume=` value for a music bed. Returns the historic flat gain
 * when there are no word timings to duck against — a missing transcript must
 * never block a render, it just costs the ducking.
 */
export function musicBedVolumeExpr(
  speechRanges: { start: number; end: number }[],
  totalDurationSec: number,
): string {
  if (!speechRanges.length || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    return String(FLAT_MUSIC_GAIN);
  }
  const segs = computeDuckEnvelope(speechRanges, totalDurationSec, {
    duckGain: FLAT_MUSIC_GAIN,
    fullGain: FULL_MUSIC_GAIN,
  });
  // eval=frame is required: without it FFmpeg evaluates the expression once, at
  // t=0, and the whole track plays at whatever the first segment resolved to.
  return `'${duckVolumeExpr(segs, FLAT_MUSIC_GAIN)}':eval=frame`;
}
