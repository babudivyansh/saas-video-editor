// How well a stored crop keeps people in frame — the number the reframing
// work is judged by.
//
// "Looks fine" on a handful of clips is how the podcast demos shipped with
// every guest's face cut in half (2026-11-24). This scores a crop against the
// face samples it was computed from: at each sampled moment, is the person who
// matters inside the crop window the renderer will actually show?
//
// The renderer interpolates linearly between keyframes (lib/reframe.ts
// lerpExpr), so this does too — comparing against the nearest keyframe would
// judge a path the viewer never sees.

import { cropSizeFrac, type CropKeyframe, type FaceBox, type StoredCrop } from "@/lib/reframe";

type Aspect = "9:16" | "16:9" | "1:1";
type Window = { x: number; y: number; w: number; h: number };

/** The crop window at clip-relative time `t`, linearly interpolated. */
export function cropAt(keyframes: CropKeyframe[], t: number): Window | null {
  if (keyframes.length === 0) return null;
  const kf = keyframes;
  if (t <= kf[0].tSec) return kf[0];
  const last = kf[kf.length - 1];
  if (t >= last.tSec) return last;
  for (let i = 1; i < kf.length; i++) {
    if (t <= kf[i].tSec) {
      const a = kf[i - 1], b = kf[i];
      const span = b.tSec - a.tSec;
      const u = span > 0 ? (t - a.tSec) / span : 1;
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        w: a.w + (b.w - a.w) * u,
        h: a.h + (b.h - a.h) * u,
      };
    }
  }
  return last;
}

/** Share of the face box's width that falls inside the window, 0..1. */
export function faceInsideFrac(face: Window, win: Window): number {
  const ix = Math.max(0, Math.min(face.x + face.w, win.x + win.w) - Math.max(face.x, win.x));
  const iy = Math.max(0, Math.min(face.y + face.h, win.y + win.h) - Math.max(face.y, win.y));
  const area = face.w * face.h;
  return area > 0 ? (ix * iy) / area : 0;
}

/** A face counts as "in frame" when this much of it is visible. */
export const FACE_VISIBLE_FRAC = 0.9;

export interface FramingScore {
  /** Moments with at least one face. */
  moments: number;
  /** Moments where the main face (speaker if known, else the largest) is in frame. */
  mainVisible: number;
  /** Moments where NO face at all is in frame although there were faces. */
  nobodyVisible: number;
  /** mainVisible / moments, 1 when there were no moments. */
  score: number;
}

function mainFace(faces: FaceBox[]): FaceBox {
  const scored = faces.filter((f) => typeof f.speaking === "number");
  if (scored.length > 0) return scored.reduce((a, c) => ((c.speaking ?? 0) > (a.speaking ?? 0) ? c : a));
  return faces.reduce((a, c) => (c.w * c.h > a.w * a.h ? c : a));
}

/** The windows the viewer sees at time t, for any stored crop shape. */
function windowsAt(stored: StoredCrop | null, t: number, aspect: Aspect, srcW: number, srcH: number): Window[] | "all" {
  if (!stored) {
    // No stored crop: the renderer's static centre crop.
    const { w, h } = cropSizeFrac(aspect, srcW, srcH);
    return [{ x: (1 - w) / 2, y: (1 - h) / 2, w, h }];
  }
  switch (stored.mode) {
    case "fit": return "all";
    case "single": { const w = cropAt(stored.keyframes, t); return w ? [w] : []; }
    case "split": return [cropAt(stored.a, t), cropAt(stored.b, t)].filter((w): w is Window => !!w);
    case "pip": return [cropAt(stored.main, t), cropAt(stored.cam, t)].filter((w): w is Window => !!w);
  }
}

/**
 * Score a crop against clip-relative face samples. Faces below 60 confidence
 * are ignored, matching what the reframe code itself trusts.
 */
export function scoreFraming(
  stored: StoredCrop | null,
  clipFaces: FaceBox[],
  aspect: Aspect,
  srcW: number,
  srcH: number,
): FramingScore {
  const byTime = new Map<number, FaceBox[]>();
  for (const f of clipFaces) {
    if (f.confidence < 60) continue;
    const arr = byTime.get(f.tSec);
    if (arr) arr.push(f); else byTime.set(f.tSec, [f]);
  }
  let mainVisible = 0, nobodyVisible = 0;
  for (const [t, faces] of byTime) {
    const wins = windowsAt(stored, t, aspect, srcW, srcH);
    const visible = (f: FaceBox) => wins === "all" || wins.some((w) => faceInsideFrac(f, w) >= FACE_VISIBLE_FRAC);
    if (visible(mainFace(faces))) mainVisible++;
    if (!faces.some(visible)) nobodyVisible++;
  }
  const moments = byTime.size;
  return { moments, mainVisible, nobodyVisible, score: moments > 0 ? mainVisible / moments : 1 };
}
