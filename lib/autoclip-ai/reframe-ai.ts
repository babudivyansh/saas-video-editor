// Stages 3-5 brought together: one crop path per clip from
//
//   * the shot boundaries (Stage 3) — the path restarts at every hard cut,
//     and each shot is framed on its own terms, instead of panning across;
//   * Gemini's per-shot labels (Stage 4) — screen recordings hold on the
//     screen, product shots on the product, gameplay gets the facecam layout;
//   * SAM 2 subject tracks (Stage 5) — a product shot follows the product;
//   * the camera path solver and speaker lead (Stage 5) as a final pass.
//
// The face-based framing that exists today is passed in as `base` and is
// still what frames every shot of people. With every feature off and no AI
// data this returns `base` for the whole clip, unchanged — that is the
// contract the tests hold it to.

import { cropSizeFrac, gamingLayoutFromCam, simplifyKeyframes, type CropKeyframe, type FaceBox, type StoredCrop } from "@/lib/reframe";
import type { SpeakerMode } from "@/lib/speaker-modes";
import type { WordTiming } from "@/utils/elevenlabs";
import type { AiFeatureSet } from "@/lib/autoclip-ai/config";
import type { PlanLayout } from "@/lib/autoclip-ai/edit-plan";
import type { NormBox, SceneShot, SubjectTrack } from "@/lib/autoclip-ai/types";
import { shotRanges } from "@/lib/autoclip-ai/scene-vision";
import { cameraPathOptionsFor, smoothKeyframePath, solveCameraPath } from "@/lib/autoclip-ai/camera-path";
import { applySpeakerLead } from "@/lib/autoclip-ai/speaker-lead";

type Aspect = "9:16" | "16:9" | "1:1";

/** Layout override the base framing understands, on top of the user's speaker modes. */
export type BaseLayout = SpeakerMode | "cuts" | "wide";

/**
 * The existing face-based framing for a window of the clip. `startSec` and
 * `endSec` are clip-relative; the keyframes it returns are relative to
 * `startSec`.
 */
export type BaseCrop = (startSec: number, endSec: number, layout?: BaseLayout) => StoredCrop | null;

export interface AiReframeInput {
  features: Partial<AiFeatureSet>;
  /** Shot boundaries, clip-relative seconds (the signal track's scene cuts). */
  shots: number[];
  scenes?: SceneShot[] | null;
  tracks?: SubjectTrack[] | null;
  /** Clip-relative words with speaker labels (speaker lead). */
  words?: WordTiming[] | null;
  /** Clip-relative faces (speaker lead's label-to-track match). */
  faces?: FaceBox[] | null;
  planLayout?: PlanLayout | null;
  smoothness?: number;
  trackingSpeed?: number;
}

const CUT_SEC = 1 / 30;
const HOLD_STEP_SEC = 1;
/** A label is acted on only above this confidence. */
const SCENE_MIN_CONFIDENCE = 70;
/** A clip-level layout from vision needs this share of the clip. */
const CLIP_MAJORITY = 0.6;
/** Keyframe budget after the AI passes (the face path alone uses 40). */
const MAX_AI_KEYFRAMES = 64;
/** Shots wanting a whole-frame layout must cover this share of the clip for the clip to take it. */
const LAYOUT_CLIP_SHARE = 0.6;

/** A held crop with one keyframe a second (silence removal must leave at least two). */
export function holdKeyframes(box: Omit<CropKeyframe, "tSec">, durationSec: number): CropKeyframe[] {
  const kf: CropKeyframe[] = [];
  for (let t = 0; t < durationSec; t += HOLD_STEP_SEC) kf.push({ tSec: t, ...box });
  kf.push({ tSec: durationSec, ...box });
  return kf;
}

/** The aspect's crop window, centred on a box's centre and clamped to the frame. */
export function cropOnBox(box: NormBox, aspect: Aspect, srcW: number, srcH: number): Omit<CropKeyframe, "tSec"> {
  const { w, h } = cropSizeFrac(aspect, srcW, srcH);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return { w, h, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)) };
}

/** Facecam on top, gameplay below — from Gemini's facecam box instead of a guessed face. */
export function gamingFromFacecam(box: NormBox, srcW: number, srcH: number, durationSec: number): StoredCrop | null {
  return gamingLayoutFromCam(box, srcW, srcH, durationSec, 1.05);
}

function overlap(a: { startSec: number; endSec: number }, b: { startSec: number; endSec: number }): number {
  return Math.max(0, Math.min(a.endSec, b.endSec) - Math.max(a.startSec, b.startSec));
}

function confidentScene(scenes: SceneShot[] | null | undefined, range: { startSec: number; endSec: number }): SceneShot | null {
  let best: SceneShot | null = null, bestOv = 0;
  for (const s of scenes ?? []) {
    if (s.confidence < SCENE_MIN_CONFIDENCE) continue;
    const ov = overlap(s, range);
    if (ov > bestOv) { bestOv = ov; best = s; }
  }
  return best && bestOv >= (range.endSec - range.startSec) * 0.5 ? best : null;
}

/** The scene type covering most of the clip, if it covers enough of it. */
export function clipMajorityScene(scenes: SceneShot[] | null | undefined, durationSec: number): SceneShot | null {
  const by = new Map<string, { secs: number; first: SceneShot }>();
  for (const s of scenes ?? []) {
    if (s.confidence < SCENE_MIN_CONFIDENCE) continue;
    const e = by.get(s.type) ?? { secs: 0, first: s };
    e.secs += s.endSec - s.startSec;
    by.set(s.type, e);
  }
  let best: { secs: number; first: SceneShot } | null = null;
  for (const e of by.values()) if (!best || e.secs > best.secs) best = e;
  return best && best.secs >= durationSec * CLIP_MAJORITY ? best.first : null;
}

function offset(kf: CropKeyframe[], by: number): CropKeyframe[] {
  return kf.map((k) => ({ ...k, tSec: k.tSec + by }));
}

/**
 * Join per-shot paths: each shot's framing runs to one frame before the next
 * shot starts, then jumps. Inputs are already clip-relative.
 */
export function joinShots(parts: { startSec: number; endSec: number; kf: CropKeyframe[] }[]): CropKeyframe[] {
  const out: CropKeyframe[] = [];
  parts.forEach((p, i) => {
    const kf = p.kf.filter((k) => k.tSec >= p.startSec - 1e-6 && k.tSec <= p.endSec + 1e-6);
    if (kf.length === 0) return;
    if (kf[0].tSec > p.startSec + 1e-6) kf.unshift({ ...kf[0], tSec: p.startSec });
    const last = i === parts.length - 1;
    const endAt = last ? p.endSec : p.endSec - CUT_SEC;
    const body = kf.filter((k) => k.tSec < endAt - 1e-6);
    const tail = kf[kf.length - 1];
    out.push(...body, { ...tail, tSec: Math.max(p.startSec, endAt) });
  });
  return out;
}

function postProcess(crop: StoredCrop | null, ai: AiReframeInput): StoredCrop | null {
  if (!crop || crop.mode !== "single" || crop.keyframes.length < 2) return crop;
  let kf = crop.keyframes;
  if (ai.features.cameraPath) kf = smoothKeyframePath(kf, cameraPathOptionsFor(ai.smoothness, ai.trackingSpeed));
  if (ai.features.speakerLead && ai.words?.length) kf = applySpeakerLead(kf, ai.words, ai.faces ?? []);
  if (kf.length > MAX_AI_KEYFRAMES) kf = simplifyKeyframes(kf, undefined, MAX_AI_KEYFRAMES);
  return { mode: "single", keyframes: kf };
}

export function composeAiCrop(args: {
  durationSec: number;
  aspect: Aspect;
  srcW: number;
  srcH: number;
  /** The user's own Speaker mode. Only "auto" lets the AI pick a layout. */
  userSpeakerMode: SpeakerMode;
  base: BaseCrop;
  ai: AiReframeInput;
}): StoredCrop | null {
  const { durationSec: dur, aspect, srcW, srcH, ai } = args;
  const f = ai.features;
  const scenes = f.sceneVision ? ai.scenes ?? null : null;
  const tracks = f.subjectTrack ? ai.tracks ?? null : null;
  const anyAi = f.shotAwareReframe || scenes?.length || tracks?.length || f.cameraPath || f.speakerLead || ai.planLayout;
  if (!anyAi || srcW <= 0 || srcH <= 0 || dur <= 0) return args.base(0, dur);

  const auto = args.userSpeakerMode === "auto";

  // ── Clip-level layouts ──
  if (auto) {
    const major = clipMajorityScene(scenes, dur);
    if (major?.type === "gameplay_facecam" && major.facecamBox && aspect === "9:16") {
      const g = gamingFromFacecam(major.facecamBox, srcW, srcH, dur);
      if (g) return g;
    }
    if (ai.planLayout && ai.planLayout !== "single") {
      const forced = args.base(0, dur, ai.planLayout === "split" ? "split" : ai.planLayout);
      if (forced) return postProcess(forced, ai);
    }
  }

  // ── Per-shot framing ──
  const ranges = f.shotAwareReframe ? shotRanges(ai.shots, dur) : [{ startSec: 0, endSec: dur }];
  const { w: cropW, h: cropH } = cropSizeFrac(aspect, srcW, srcH);
  const pathOpts = cameraPathOptionsFor(ai.smoothness, ai.trackingSpeed);
  const parts: { startSec: number; endSec: number; kf: CropKeyframe[] }[] = [];
  let aiShaped = false;
  // Share of the clip whose shots want a whole-frame layout (split, fit, pip),
  // computed once, lazily: only needed when the first such shot turns up.
  let layoutSecs: number | null = null;
  const layoutShare = (): number => {
    if (layoutSecs === null) {
      layoutSecs = 0;
      for (const q of ranges) {
        const c = args.base(q.startSec, q.endSec, ai.planLayout === "single" ? "single" : undefined);
        if (c && c.mode !== "single") layoutSecs += q.endSec - q.startSec;
      }
    }
    return layoutSecs / dur;
  };

  for (const r of ranges) {
    const len = r.endSec - r.startSec;
    const scene = auto ? confidentScene(scenes, r) : null;
    const track = scene?.type === "product"
      ? (tracks ?? []).find((t) => overlap(t, r) >= len * 0.5 && t.samples.length >= 2)
      : undefined;

    if (track) {
      const samples = track.samples
        .filter((s) => s.t >= r.startSec - 0.05 && s.t <= r.endSec + 0.05)
        .map((s) => ({ t: s.t - r.startSec, cx: s.x + s.w / 2, cy: s.y + s.h / 2 }));
      if (samples.length >= 2) {
        parts.push({ ...r, kf: offset(solveCameraPath(samples, len, cropW, cropH, pathOpts), r.startSec) });
        aiShaped = true;
        continue;
      }
    }
    const box = scene?.type === "screen" ? scene.screenBox : scene?.type === "product" ? scene.subjectBox : undefined;
    if (box) {
      parts.push({ ...r, kf: offset(holdKeyframes(cropOnBox(box, aspect, srcW, srcH), len), r.startSec) });
      aiShaped = true;
      continue;
    }

    let crop = args.base(r.startSec, r.endSec, ai.planLayout === "single" ? "single" : undefined);
    if (crop && crop.mode !== "single") {
      // A layout (split, full frame, picture-in-picture) can't be one shot of
      // several. When such shots are most of the clip, the layout is the
      // clip's: frame it as a whole. When it is one odd shot (a two-shot in a
      // run of close-ups), keep the other shots' framing and frame this one
      // on its own face — dropping shot awareness for the whole clip used to
      // put one blended path across every camera angle.
      if (ranges.length === 1 || layoutShare() >= LAYOUT_CLIP_SHARE) return postProcess(args.base(0, dur), ai);
      crop = args.base(r.startSec, r.endSec, "single");
    }
    if (crop?.mode === "single" && crop.keyframes.length > 0) {
      parts.push({ ...r, kf: offset(crop.keyframes, r.startSec) });
    } else {
      // No framing for this shot: a centred crop, held.
      parts.push({ ...r, kf: offset(holdKeyframes({ w: cropW, h: cropH, x: (1 - cropW) / 2, y: (1 - cropH) / 2 }, len), r.startSec) });
    }
  }

  // One range and nothing AI-specific happened: the face path as it always was.
  if (ranges.length === 1 && !aiShaped) return postProcess(args.base(0, dur, ai.planLayout === "single" ? "single" : undefined), ai);
  return postProcess({ mode: "single", keyframes: joinShots(parts) }, ai);
}
