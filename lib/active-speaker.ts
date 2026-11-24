// Who is speaking, per face sample, from two signals AutoClip already has:
//
//   * the transcript's speaker labels — ElevenLabs Scribe is called with
//     diarize=true, so every word says WHEN each voice talks;
//   * mouth movement per tracked face (lib/face-detect-local.ts) — which face
//     is moving its lips at that moment.
//
// Diarization alone can't say which face a voice belongs to, and mouth
// movement alone is noisy (a laugh, a nod, a hand near the face). Together:
// at moments when two or more faces share the frame and one label is talking,
// the face whose mouth moves most gets a vote for that label. A track takes
// the label it won most clearly, and from then on its `speaking` follows the
// transcript, which has exact timing and no lip-reading noise.
//
// Only the moments with two or more faces matter for framing (one face on
// screen is framed whatever it is doing), so single-face samples are left
// without a score — "no signal", which the reframe code already handles.
//
// Hysteresis lives here too: interjections ("yeah", "right", a laugh) and
// very short turns are folded into the surrounding speaker's turn, so a
// one-word backchannel never moves the camera.

import type { FaceBox } from "@/lib/reframe";

export interface SpeakerWord { start: number; end: number; speaker?: string; word?: string }

/** Turns shorter than this, or of at most INTERJECTION_WORDS words, don't change who is speaking. */
export const MIN_TURN_SEC = 0.8;
export const INTERJECTION_WORDS = 2;
/** Gaps up to this long inside one speaker's turn still count as the turn. */
const TURN_GAP_SEC = 0.6;
/** Motion is averaged over this many seconds either side of a sample. */
const SMOOTH_SEC = 0.5;
/** A vote needs the top face's mouth this much more active than the next (ratio). */
const VOTE_MARGIN = 1.15;
/** A track takes a label with at least this many votes and this share of its votes. */
const MIN_VOTES = 3;
const MIN_VOTE_SHARE = 0.6;
/** Of two co-visible tracks claiming one voice, the winner needs this many times the votes. */
const CLAIM_RATIO = 1.5;

export const SPEAKING_YES = 0.9;
export const SPEAKING_NO = 0.1;

export interface Turn { speaker: string; start: number; end: number; words: number }

/**
 * Speaker turns in seconds from word timings in milliseconds, with short
 * interjections absorbed into the turn around them (or the neighbouring turn
 * at the edges), and same-speaker turns separated by short gaps joined.
 */
export function buildTurns(words: SpeakerWord[]): Turn[] {
  const raw: Turn[] = [];
  for (const w of words) {
    if (!w.speaker) continue;
    const s = w.start / 1000, e = w.end / 1000;
    const last = raw[raw.length - 1];
    if (last && last.speaker === w.speaker && s - last.end <= TURN_GAP_SEC) {
      last.end = Math.max(last.end, e); last.words++;
    } else raw.push({ speaker: w.speaker, start: s, end: e, words: 1 });
  }
  const short = (t: Turn) => t.end - t.start < MIN_TURN_SEC || t.words <= INTERJECTION_WORDS;
  // A short turn is not a change of speaker for the camera: fold it into the
  // turn before it (or, for the very first turn, the one after), then join
  // what became neighbouring turns of one speaker.
  const kept: Turn[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = { ...raw[i] };
    const prev = kept[kept.length - 1];
    if (short(t) && prev && t.start - prev.end <= TURN_GAP_SEC * 2) { prev.end = Math.max(prev.end, t.end); continue; }
    if (short(t) && raw[i + 1] && raw[i + 1].start - t.end <= TURN_GAP_SEC) {
      raw[i + 1] = { ...raw[i + 1], start: t.start };
      continue;
    }
    kept.push(t);
  }
  const out: Turn[] = [];
  for (const t of kept) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === t.speaker && t.start - prev.end <= TURN_GAP_SEC * 2) {
      prev.end = Math.max(prev.end, t.end); prev.words += t.words;
    } else out.push(t);
  }
  return out;
}

/** The speaker label talking at t, or null in silence. */
export function speakerAt(turns: Turn[], t: number): string | null {
  // Turns are sorted and few; a linear scan is fine.
  for (const turn of turns) {
    if (t < turn.start - 0.1) return null;
    if (t <= turn.end + 0.1) return turn.speaker;
  }
  return null;
}

/** Each sample's mouth motion averaged with its own track's neighbours (±SMOOTH_SEC). */
function smoothedMotion(faces: FaceBox[]): Map<FaceBox, number> {
  const byTrack = new Map<string, FaceBox[]>();
  for (const f of faces) {
    if (!f.trackId || f.mouthMotion === undefined) continue;
    (byTrack.get(f.trackId) ?? byTrack.set(f.trackId, []).get(f.trackId)!).push(f);
  }
  const out = new Map<FaceBox, number>();
  for (const track of byTrack.values()) {
    track.sort((a, b) => a.tSec - b.tSec);
    let lo = 0, hi = 0, sum = 0;
    for (let i = 0; i < track.length; i++) {
      const t = track[i].tSec;
      while (hi < track.length && track[hi].tSec <= t + SMOOTH_SEC) sum += track[hi++].mouthMotion!;
      while (track[lo].tSec < t - SMOOTH_SEC) sum -= track[lo++].mouthMotion!;
      out.set(track[i], sum / (hi - lo));
    }
  }
  return out;
}

/** Faces grouped by moment (sample time). */
function byMoment(faces: FaceBox[]): FaceBox[][] {
  const m = new Map<number, FaceBox[]>();
  for (const f of faces) {
    const k = Math.round(f.tSec * 1000);
    (m.get(k) ?? m.set(k, []).get(k)!).push(f);
  }
  return [...m.values()];
}

/**
 * Which diarization label each track speaks with, from mouth-movement votes
 * at the moments it shares the frame with someone else.
 */
export function mapTracksToSpeakers(faces: FaceBox[], turns: Turn[]): Map<string, string> {
  const motion = smoothedMotion(faces);
  const votes = new Map<string, Map<string, number>>();
  for (const moment of byMoment(faces)) {
    const scored = moment.filter((f) => f.trackId && motion.has(f));
    if (scored.length < 2) continue;
    const label = speakerAt(turns, moment[0].tSec);
    if (!label) continue;
    scored.sort((a, b) => motion.get(b)! - motion.get(a)!);
    if (motion.get(scored[0])! < motion.get(scored[1])! * VOTE_MARGIN) continue;
    const id = scored[0].trackId!;
    const v = votes.get(id) ?? votes.set(id, new Map()).get(id)!;
    v.set(label, (v.get(label) ?? 0) + 1);
  }
  const map = new Map<string, string>();
  const won = new Map<string, number>();
  for (const [id, v] of votes) {
    const total = [...v.values()].reduce((a, b) => a + b, 0);
    const [label, n] = [...v].sort((a, b) => b[1] - a[1])[0];
    if (n >= MIN_VOTES && n / total >= MIN_VOTE_SHARE) { map.set(id, label); won.set(id, n); }
  }
  // Two tracks that share the frame can't be the same voice. When only one
  // person talks through a shot, both faces collect votes for that one label
  // (the listener's mouth still moves sometimes): the track that won clearly
  // more keeps it. Too close to call — diarization may have merged two
  // people into one label — and neither keeps it.
  const sharing = new Map<string, Set<string>>();
  for (const moment of byMoment(faces)) {
    for (const a of moment) for (const b of moment) {
      if (a.trackId && b.trackId && a.trackId !== b.trackId) {
        (sharing.get(a.trackId) ?? sharing.set(a.trackId, new Set()).get(a.trackId)!).add(b.trackId);
      }
    }
  }
  const drop = new Set<string>();
  for (const [id, label] of map) {
    for (const other of sharing.get(id) ?? []) {
      if (map.get(other) !== label) continue;
      const a = won.get(id)!, b = won.get(other)!;
      if (a >= b * CLAIM_RATIO) drop.add(other);
      else if (b >= a * CLAIM_RATIO) drop.add(id);
      else { drop.add(id); drop.add(other); }
    }
  }
  for (const id of drop) map.delete(id);
  return map;
}

/**
 * Set `speaking` on every face that shares the frame with another face.
 * Returns new FaceBox objects; samples alone on screen are returned as they
 * were (no signal). With no speaker labels at all (a transcript without
 * diarization), the face whose mouth moves clearly more than the others' is
 * the speaker, but only while someone is talking.
 */
export function assignSpeaking(faces: FaceBox[], words: SpeakerWord[] | null | undefined): FaceBox[] {
  if (faces.length === 0 || !faces.some((f) => f.mouthMotion !== undefined)) return faces;
  // No transcript (transcription failed): no way to tell talk from silence,
  // so no signal at all — not "everyone silent", which would read as one.
  const ws = words ?? [];
  if (ws.length === 0) return faces;
  const labelled = ws.some((w) => w.speaker);
  const turns = labelled ? buildTurns(ws) : buildTurns(ws.map((w) => ({ ...w, speaker: "voice" })));
  const map = labelled ? mapTracksToSpeakers(faces, turns) : new Map<string, string>();
  const motion = smoothedMotion(faces);
  const result = new Map<FaceBox, number>();

  for (const moment of byMoment(faces)) {
    if (moment.length < 2) continue;
    const label = speakerAt(turns, moment[0].tSec);
    if (!label) { for (const f of moment) result.set(f, SPEAKING_NO); continue; }
    const mapped = moment.filter((f) => f.trackId && map.get(f.trackId) === label);
    if (mapped.length === 1) {
      for (const f of moment) result.set(f, f === mapped[0] ? SPEAKING_YES : SPEAKING_NO);
      continue;
    }
    // Two faces, one known to be a different voice: the other is the talker.
    const others = moment.filter((f) => !(f.trackId && map.has(f.trackId) && map.get(f.trackId) !== label));
    if (moment.length === 2 && others.length === 1) {
      for (const f of moment) result.set(f, f === others[0] ? SPEAKING_YES - 0.1 : SPEAKING_NO);
      continue;
    }
    // No (unique) mapping for this voice here: fall back to whose mouth moves.
    const scored = moment.filter((f) => motion.has(f)).sort((a, b) => motion.get(b)! - motion.get(a)!);
    if (scored.length >= 2 && motion.get(scored[0])! >= motion.get(scored[1])! * VOTE_MARGIN) {
      for (const f of moment) result.set(f, f === scored[0] ? 0.75 : 0.25);
    }
  }
  return faces.map((f) => (result.has(f) ? { ...f, speaking: result.get(f)! } : f));
}
