// Jump-zoom: the camera SNAPS between a wide and a tight framing instead of
// drifting. This is the zoom most short-form edits use — a cut-in on a new
// sentence or a key word re-hooks attention, and because it is a cut it can
// never look like the camera losing its place the way a slow, mistimed
// push-in can.
//
// Pure: word timings in, zoom steps out, then the steps applied to an
// existing crop path. Keyframes one frame apart are how the renderer draws a
// cut (lib/scene-layout.ts buildCutKeyframes does the same for speakers).

import type { CropKeyframe } from "@/lib/reframe";
import type { WordTiming } from "@/utils/elevenlabs";

/** How tight the "tight" framing is, by the user's Zoom strength. */
export const JUMP_ZOOM_LEVEL: Record<"low" | "medium" | "high", number> = {
  low: 1.08,
  medium: 1.15,
  high: 1.22, // past ~1.25 a 1080p source visibly softens (see ZOOM_STRENGTH_MAX)
};

export const JUMP_LIMITS = {
  /** Never cut in the first moment (the hook is framed as shot). */
  leadInSec: 0.6,
  /** ...or just before the end. */
  leadOutSec: 1.0,
  /** A cut-zoom more often than this reads as a strobe. */
  minGapSec: 2.0,
  /** A gap between words this long starts a new phrase. */
  phraseGapMs: 350,
} as const;

/** The framing changes to this zoom at tSec and holds until the next step. */
export interface ZoomStep { tSec: number; zoom: number }

const CUT_SEC = 1 / 30;
const SENTENCE_END = /[.!?…]["')\]]*$/;

/**
 * Where the zoom changes, from the transcript alone: tighten or widen on each
 * new phrase (alternating), and always tighten on an emphasised word.
 * `words` and `emphasis` are on one timeline (clip-relative ms / indexes).
 */
export function buildJumpZoomSteps(args: {
  words: WordTiming[];
  emphasis?: number[];
  durationSec: number;
  strength: "low" | "medium" | "high";
}): ZoomStep[] {
  const { words, durationSec } = args;
  if (words.length < 2 || durationSec <= 0) return [];
  const tight = JUMP_ZOOM_LEVEL[args.strength] ?? JUMP_ZOOM_LEVEL.medium;
  const L = JUMP_LIMITS;
  const emphasis = new Set(args.emphasis ?? []);

  const cands: { t: number; kind: "phrase" | "emphasis" }[] = [];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const newPhrase = SENTENCE_END.test(prev.word.trim()) || words[i].start - prev.end >= L.phraseGapMs;
    if (emphasis.has(i)) cands.push({ t: words[i].start / 1000, kind: "emphasis" });
    else if (newPhrase) cands.push({ t: words[i].start / 1000, kind: "phrase" });
  }

  const steps: ZoomStep[] = [];
  let level = 1;
  let last = -Infinity;
  for (const c of cands) {
    if (c.t < L.leadInSec || c.t > durationSec - L.leadOutSec) continue;
    if (c.t - last < L.minGapSec) continue;
    const next = c.kind === "emphasis" ? tight : level === 1 ? tight : 1;
    if (next === level) continue;
    steps.push({ tSec: Math.round(c.t * 1000) / 1000, zoom: next });
    level = next;
    last = c.t;
  }
  return steps;
}

/**
 * Steps from the AI edit plan's punch-ins: snap in on each planned word, snap
 * back out when its hold (or a reset) ends. Times on the plan's timeline.
 */
export function stepsFromPlan(
  zooms: { tSec: number; strength: number; holdSec: number }[],
  durationSec: number,
  strength: "low" | "medium" | "high",
): ZoomStep[] {
  const tight = JUMP_ZOOM_LEVEL[strength] ?? JUMP_ZOOM_LEVEL.medium;
  const steps: ZoomStep[] = [];
  for (const z of [...zooms].sort((a, b) => a.tSec - b.tSec)) {
    const zoom = 1 + (tight - 1) * Math.min(1, Math.max(0.5, z.strength));
    const out = Math.min(durationSec - JUMP_LIMITS.leadOutSec, z.tSec + Math.max(0.8, z.holdSec));
    if (steps.length && z.tSec < steps[steps.length - 1].tSec + 0.3) continue;
    steps.push({ tSec: z.tSec, zoom });
    if (out > z.tSec + 0.3) steps.push({ tSec: out, zoom: 1 });
  }
  return steps;
}

/** Linear sample of a crop path at t (holds the ends). */
function sampleKeyframes(kf: CropKeyframe[], t: number): CropKeyframe {
  if (t <= kf[0].tSec) return { ...kf[0], tSec: t };
  const lastKf = kf[kf.length - 1];
  if (t >= lastKf.tSec) return { ...lastKf, tSec: t };
  let i = 0;
  while (i < kf.length - 2 && kf[i + 1].tSec < t) i++;
  const a = kf[i], b = kf[i + 1];
  const f = b.tSec > a.tSec ? (t - a.tSec) / (b.tSec - a.tSec) : 1;
  return { tSec: t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, w: a.w + (b.w - a.w) * f, h: a.h + (b.h - a.h) * f };
}

/**
 * Apply zoom steps to a crop path. Each step becomes a hold keyframe one
 * frame before it and the new framing at it, so the zoom cuts instead of
 * ramping. The crop centre follows the existing path, so speaker tracking and
 * cuts keep working underneath.
 */
export function applyStepZoom(keyframes: CropKeyframe[], steps: ZoomStep[], durationSec: number): CropKeyframe[] {
  if (keyframes.length === 0 || steps.length === 0) return keyframes;
  const path = [...keyframes].sort((a, b) => a.tSec - b.tSec);
  const sorted = [...steps].filter((s) => s.tSec > CUT_SEC && s.tSec < durationSec).sort((a, b) => a.tSec - b.tSec);
  const levelAt = (t: number) => {
    let z = 1;
    for (const s of sorted) if (s.tSec <= t + 1e-9) z = s.zoom; else break;
    return z;
  };
  const times = new Set<number>(path.map((k) => k.tSec));
  for (const s of sorted) { times.add(s.tSec - CUT_SEC); times.add(s.tSec); }
  return [...times]
    .filter((t) => t >= 0 && t <= durationSec + 1e-9)
    .sort((a, b) => a - b)
    .map((t) => {
      const base = sampleKeyframes(path, t);
      const z = Math.max(1, levelAt(t));
      const w = base.w / z, h = base.h / z;
      const cx = base.x + base.w / 2, cy = base.y + base.h / 2;
      return {
        tSec: Math.round(t * 1000) / 1000,
        w, h,
        x: Math.min(1 - w, Math.max(0, cx - w / 2)),
        y: Math.min(1 - h, Math.max(0, cy - h / 2)),
      };
    });
}
