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
