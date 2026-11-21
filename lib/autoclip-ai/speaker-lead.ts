// Stage 5 — cut to the next speaker just BEFORE they talk.
//
// The dialogue cuts (lib/scene-layout.ts buildCutKeyframes) react to the
// active-speaker signal, so they land after the new speaker has started — the
// viewer hears the voice, then the camera catches up. Edited dialogue does the
// opposite: the cut leads the voice by a few frames. The transcript already
// knows when each person starts (Scribe's diarization labels every word), so
// each cut is moved to just before that speaker's first word.
//
// When ASD track ids are available, a cut is only moved if the face it cuts
// TO belongs to the speaker who starts talking — otherwise a diarization
// mistake would drag a correct cut onto the wrong moment.

import type { CropKeyframe, FaceBox } from "@/lib/reframe";
import { splitAtCuts } from "@/lib/autoclip-ai/camera-path";
import type { WordTiming } from "@/utils/elevenlabs";

export const SPEAKER_LEAD_SEC = 0.25;
/** How far around a cut to look for the speaker change it belongs to. */
const SEARCH_BEFORE_SEC = 1.5;
const SEARCH_AFTER_SEC = 0.3;
/** A moved cut keeps at least this much of the previous shot. */
const MIN_SHOT_SEC = 0.6;
const CUT_SEC = 1 / 30;
/** The face a cut lands on must be this close (frame fraction) to the speaker's track. */
const TRACK_MATCH_FRAC = 0.15;

/** Clip-relative seconds where the speaker label changes, with the new label. */
export function speakerChanges(words: WordTiming[]): { tSec: number; speaker: string }[] {
  const out: { tSec: number; speaker: string }[] = [];
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1].speaker, b = words[i].speaker;
    if (a && b && a !== b) out.push({ tSec: words[i].start / 1000, speaker: b });
  }
  return out;
}

/**
 * Each diarization label's horizontal position: the mean centre of the ASD
 * track that is most often "speaking" while that label's words are said.
 * Clip-relative `faces`. Labels with no clear track are left out.
 */
export function speakerPositions(words: WordTiming[], faces: FaceBox[]): Map<string, number> {
  const votes = new Map<string, Map<string, number>>();
  const centres = new Map<string, { sum: number; n: number }>();
  for (const f of faces) {
    if (!f.trackId) continue;
    const c = centres.get(f.trackId) ?? { sum: 0, n: 0 };
    c.sum += f.x + f.w / 2; c.n++;
    centres.set(f.trackId, c);
  }
  for (const w of words) {
    if (!w.speaker) continue;
    const t0 = w.start / 1000, t1 = w.end / 1000;
    for (const f of faces) {
      if (!f.trackId || f.tSec < t0 - 0.1 || f.tSec > t1 + 0.1 || (f.speaking ?? 0) < 0.5) continue;
      const m = votes.get(w.speaker) ?? new Map<string, number>();
      m.set(f.trackId, (m.get(f.trackId) ?? 0) + 1);
      votes.set(w.speaker, m);
    }
  }
  const out = new Map<string, number>();
  for (const [label, m] of votes) {
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    const c = best && centres.get(best[0]);
    if (c && c.n > 0) out.set(label, c.sum / c.n);
  }
  return out;
}

/**
 * Move each cut in a single-crop path to SPEAKER_LEAD_SEC before the speaker
 * change it corresponds to. Keyframes are clip-relative. Pure.
 *
 * Works on runs (the stretches between cuts): each boundary gets a new time,
 * then every run is re-emitted between its new boundaries with a hold
 * keyframe one frame before the next cut, so a cut stays a cut.
 */
export function applySpeakerLead(
  keyframes: CropKeyframe[],
  words: WordTiming[],
  faces: FaceBox[] = [],
  leadSec = SPEAKER_LEAD_SEC,
): CropKeyframe[] {
  const changes = speakerChanges(words);
  if (changes.length === 0 || keyframes.length < 3) return keyframes;
  const runs = splitAtCuts([...keyframes].sort((a, b) => a.tSec - b.tSec));
  if (runs.length < 2) return keyframes;
  const positions = faces.length > 0 ? speakerPositions(words, faces) : new Map<string, number>();

  // Boundary i sits between run i-1 and run i.
  const original = runs.map((r) => r[0].tSec);
  const moved = [...original];
  for (let i = 1; i < runs.length; i++) {
    const T = original[i];
    const into = runs[i][0];
    const change = changes
      .filter((c) => c.tSec >= T - SEARCH_BEFORE_SEC && c.tSec <= T + SEARCH_AFTER_SEC)
      .sort((x, y) => Math.abs(x.tSec - T) - Math.abs(y.tSec - T))[0];
    if (!change) continue;
    const pos = positions.get(change.speaker);
    if (pos !== undefined && Math.abs((into.x + into.w / 2) - pos) > TRACK_MATCH_FRAC) continue;
    const lo = moved[i - 1] + MIN_SHOT_SEC;
    const hi = (i + 1 < runs.length ? original[i + 1] : runs[i][runs[i].length - 1].tSec + MIN_SHOT_SEC) - MIN_SHOT_SEC;
    const N = Math.min(hi, Math.max(lo, change.tSec - leadSec));
    if (N > lo - 1e-9 && N < hi + 1e-9) moved[i] = N;
  }

  const framingAt = (run: CropKeyframe[], t: number): CropKeyframe => {
    let f = run[0];
    for (const k of run) if (k.tSec <= t + 1e-9) f = k;
    return f;
  };
  const out: CropKeyframe[] = [];
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const start = i === 0 ? run[0].tSec : moved[i];
    const end = i + 1 < runs.length ? moved[i + 1] : Infinity;
    out.push({ ...framingAt(run, start), tSec: start });
    for (const k of run) if (k.tSec > start + 1e-6 && k.tSec < end - CUT_SEC - 1e-6) out.push(k);
    if (end !== Infinity) {
      out.push({ ...framingAt(run, end - CUT_SEC), tSec: Math.max(start + 1e-3, end - CUT_SEC) });
    } else {
      const last = run[run.length - 1];
      if (last.tSec > start + 1e-6 && out[out.length - 1] !== last) out.push(last);
    }
  }
  return out;
}
