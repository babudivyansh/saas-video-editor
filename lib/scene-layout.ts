// Scene classification and the layouts that follow from it.
//
// Until now every clip got one of two treatments: pan-and-follow one face, or
// vertically stack two. That leaves the common cases unhandled — a panel of
// four people, a screen-share with a small webcam inset, a stretch with no
// face at all — and in each of those a single-face pan picks something
// arbitrary and holds on it.
//
// Classification happens ONCE per clip rather than per frame. A layout that
// changes mid-clip reads as a mistake, not as an edit.

import type { CropKeyframe, FaceBox } from "@/lib/reframe";

export type SceneType =
  | "single"       // one person: pan + energy zoom
  | "dialogue"     // two people alternating: cut between them
  | "duo"          // two people both consistently present: split screen
  | "group"        // three or more: wide group shot, punch in on the speaker
  | "none";        // no usable face: slow drift

export interface SceneClassification {
  type: SceneType;
  /** Distinct people found, keyed by track id where available. */
  people: number;
  /** How often the active speaker changes, per minute. */
  switchesPerMin: number;
}

const MIN_CONFIDENCE = 60;
const COVERAGE_FLOOR = 0.4;   // a person must appear in this share of buckets to "count"
const BUCKET_SEC = 0.5;
const DIALOGUE_SWITCHES_PER_MIN = 6; // above this, alternating cuts beat a static split

/** Group samples into people: by track id when ASD supplied one, else by position. */
export function groupIntoPeople(faces: FaceBox[]): FaceBox[][] {
  if (faces.length === 0) return [];

  const tracked = faces.every((f) => f.trackId);
  if (tracked) {
    const byTrack = new Map<string, FaceBox[]>();
    for (const f of faces) {
      const arr = byTrack.get(f.trackId!);
      if (arr) arr.push(f); else byTrack.set(f.trackId!, [f]);
    }
    return [...byTrack.values()];
  }

  // Positional fallback: bucket horizontal centres into coarse columns. Cruder
  // than tracking, but it does not pretend to more precision than it has.
  const COLUMNS = 6;
  const byColumn = new Map<number, FaceBox[]>();
  for (const f of faces) {
    const col = Math.min(COLUMNS - 1, Math.floor((f.x + f.w / 2) * COLUMNS));
    const arr = byColumn.get(col);
    if (arr) arr.push(f); else byColumn.set(col, [f]);
  }
  return [...byColumn.values()];
}

/** How many distinct half-second buckets a person appears in, as a fraction. */
function coverage(person: FaceBox[], durationSec: number): number {
  const buckets = new Set(person.map((f) => Math.floor(f.tSec / BUCKET_SEC)));
  return buckets.size / Math.max(1, Math.ceil(durationSec / BUCKET_SEC));
}

/** Count how often the highest-scoring speaker changes identity. */
export function countSpeakerSwitches(faces: FaceBox[], durationSec: number): number {
  const withScore = faces.filter((f) => typeof f.speaking === "number" && f.trackId);
  if (withScore.length === 0) return 0;

  const byTime = new Map<number, FaceBox[]>();
  for (const f of withScore) {
    const b = Math.floor(f.tSec / BUCKET_SEC);
    const arr = byTime.get(b);
    if (arr) arr.push(f); else byTime.set(b, [f]);
  }

  let switches = 0;
  let previous: string | null = null;
  for (const bucket of [...byTime.keys()].sort((a, b) => a - b)) {
    const best = byTime.get(bucket)!.reduce((a, c) => ((c.speaking ?? 0) > (a.speaking ?? 0) ? c : a));
    if ((best.speaking ?? 0) < 0.5) continue; // nobody clearly speaking
    if (previous && best.trackId !== previous) switches++;
    previous = best.trackId!;
  }
  return durationSec > 0 ? switches / (durationSec / 60) : 0;
}

export function classifyScene(faces: FaceBox[], clipStartSec: number, clipEndSec: number): SceneClassification {
  const durationSec = Math.max(0.001, clipEndSec - clipStartSec);
  const inWindow = faces
    .filter((f) => f.tSec >= clipStartSec && f.tSec <= clipEndSec && f.confidence >= MIN_CONFIDENCE)
    .map((f) => ({ ...f, tSec: f.tSec - clipStartSec }));

  if (inWindow.length === 0) return { type: "none", people: 0, switchesPerMin: 0 };

  // Only people who are actually present for a meaningful share of the clip
  // count. A face that appears for half a second is a passer-by, not a subject.
  const present = groupIntoPeople(inWindow).filter((p) => coverage(p, durationSec) >= COVERAGE_FLOOR);
  const switchesPerMin = countSpeakerSwitches(inWindow, durationSec);

  if (present.length === 0) return { type: "single", people: 1, switchesPerMin };
  if (present.length === 1) return { type: "single", people: 1, switchesPerMin };
  if (present.length >= 3) return { type: "group", people: present.length, switchesPerMin };

  // Two people. Rapid alternation is a conversation, which reads better as
  // cuts between speakers than as a permanent split screen — a split shows
  // both people all the time, so the viewer has to work out who is talking.
  return {
    type: switchesPerMin >= DIALOGUE_SWITCHES_PER_MIN ? "dialogue" : "duo",
    people: 2,
    switchesPerMin,
  };
}

// ── Layouts ─────────────────────────────────────────────────────────────────

/**
 * Cut between speakers instead of panning.
 *
 * Emits pairs of keyframes a single frame apart at each switch, so the
 * interpolated path jumps rather than sweeps. A pan across a two-shot takes
 * ~1s of screen time and draws attention to the camera; a cut is instant and
 * invisible, which is what actual edited dialogue looks like.
 */
export function buildCutKeyframes(
  faces: FaceBox[],
  durationSec: number,
  cropW: number,
  cropH: number,
  minShotSec = 1.2,
): CropKeyframe[] {
  const people = groupIntoPeople(faces);
  if (people.length < 2) return [];

  const CUT_SEC = 1 / 30; // one frame at 30fps
  const keyframes: CropKeyframe[] = [];
  let currentId: string | null = null;
  let lastCutAt = -Infinity;

  const centreOf = (person: FaceBox[], t: number) => {
    // Nearest sample in time, so the framing matches where they actually are.
    let best = person[0];
    let bestDist = Infinity;
    for (const f of person) {
      const d = Math.abs(f.tSec - t);
      if (d < bestDist) { bestDist = d; best = f; }
    }
    return { cx: best.x + best.w / 2, cy: best.y + best.h / 2 };
  };

  const idOf = (person: FaceBox[], i: number) => person[0]?.trackId ?? `p${i}`;

  for (let t = 0; t <= durationSec; t += 0.1) {
    // Whoever is most clearly speaking right now.
    let bestPerson = -1;
    let bestScore = -Infinity;
    people.forEach((person, i) => {
      const near = person.filter((f) => Math.abs(f.tSec - t) <= 0.3);
      if (near.length === 0) return;
      const score = Math.max(...near.map((f) => f.speaking ?? f.w * f.h));
      if (score > bestScore) { bestScore = score; bestPerson = i; }
    });
    if (bestPerson < 0) continue;

    const id = idOf(people[bestPerson], bestPerson);
    if (id === currentId) continue;
    // A minimum shot length stops a noisy speaker signal turning into a
    // strobe of one-frame cuts.
    if (t - lastCutAt < minShotSec) continue;

    const { cx, cy } = centreOf(people[bestPerson], t);
    const x = Math.min(1 - cropW, Math.max(0, cx - cropW / 2));
    const y = Math.min(1 - cropH, Math.max(0, cy - cropH / 2));

    if (keyframes.length > 0) {
      // Hold the previous framing right up to the cut, so the jump is clean.
      const prev = keyframes[keyframes.length - 1];
      keyframes.push({ ...prev, tSec: Math.max(prev.tSec + CUT_SEC, t - CUT_SEC) });
    }
    keyframes.push({ tSec: t, x, y, w: cropW, h: cropH });
    currentId = id;
    lastCutAt = t;
  }

  if (keyframes.length > 0) {
    const last = keyframes[keyframes.length - 1];
    if (last.tSec < durationSec) keyframes.push({ ...last, tSec: durationSec });
  }
  return keyframes;
}

/**
 * Group shot: a window wide enough to hold everyone, drifting toward whoever is
 * speaking rather than cutting. With three or more people, cutting on every
 * turn is exhausting to watch and loses the reactions that make a panel
 * watchable.
 */
export function buildGroupKeyframes(
  faces: FaceBox[],
  durationSec: number,
  cropW: number,
  cropH: number,
  speakerBias = 0.35,
): CropKeyframe[] {
  const keyframes: CropKeyframe[] = [];

  for (let t = 0; t <= durationSec; t += 0.5) {
    const near = faces.filter((f) => Math.abs(f.tSec - t) <= 0.5);
    if (near.length === 0) continue;

    // Centroid of everyone present keeps the group balanced in frame.
    const groupCx = near.reduce((s, f) => s + f.x + f.w / 2, 0) / near.length;
    const groupCy = near.reduce((s, f) => s + f.y + f.h / 2, 0) / near.length;

    // Lean toward the speaker without abandoning the group.
    const speaker = near.reduce((a, c) => ((c.speaking ?? 0) > (a.speaking ?? 0) ? c : a));
    const hasSpeaker = (speaker.speaking ?? 0) > 0.5;
    const cx = hasSpeaker ? groupCx + (speaker.x + speaker.w / 2 - groupCx) * speakerBias : groupCx;
    const cy = hasSpeaker ? groupCy + (speaker.y + speaker.h / 2 - groupCy) * speakerBias : groupCy;

    keyframes.push({
      tSec: t,
      x: Math.min(1 - cropW, Math.max(0, cx - cropW / 2)),
      y: Math.min(1 - cropH, Math.max(0, cy - cropH / 2)),
      w: cropW,
      h: cropH,
    });
  }

  return keyframes;
}

/**
 * No usable face: a slow drift across the frame so the shot is not completely
 * static. Deliberately gentle — with nothing to track, motion has no
 * justification beyond keeping the frame alive.
 */
export function buildDriftKeyframes(durationSec: number, cropW: number, cropH: number): CropKeyframe[] {
  const maxX = Math.max(0, 1 - cropW);
  const maxY = Math.max(0, 1 - cropH);
  // Stay near centre: a drift that reaches the frame edge looks like tracking
  // something that isn't there.
  const travel = Math.min(0.08, maxX / 2);
  const startX = Math.max(0, Math.min(maxX, (maxX / 2) - travel / 2));
  const endX = Math.max(0, Math.min(maxX, startX + travel));
  const y = maxY / 2;
  return [
    { tSec: 0, x: startX, y, w: cropW, h: cropH },
    { tSec: durationSec, x: endX, y, w: cropW, h: cropH },
  ];
}
