// Caption Studio: the pieces both its pages and its API share. Client-safe —
// no server imports.
//
// A Studio project is an ordinary editor document (productType "captions"):
// one video on the timeline, its speech as template caption cues, an optional
// project-wide caption style. That is what lets the editor's preview, the
// caption engine and both export paths work on it unchanged.

import {
  DEFAULT_DOC,
  originalFrame,
  type Aspect,
  type CaptionClip,
  type TimelineDoc,
  type VideoClip,
} from "@/lib/editor/types";
import { newClipId, wordsToCaptionCues, type RawWordTiming } from "@/lib/editor/caption-generation";
import type { CaptionStyleOverride } from "@clipiro/shared/caption-style";

export const STUDIO_PRODUCT_TYPE = "captions";

export interface StudioAspectOption {
  value: Aspect;
  label: string;
  hint: string;
}

/** The shapes the upload screen offers, in its order. */
export const STUDIO_ASPECTS: StudioAspectOption[] = [
  { value: "original", label: "Original", hint: "Keep your video's own shape" },
  { value: "9:16", label: "Vertical", hint: "Reels, TikTok, Shorts" },
  { value: "4:5", label: "Portrait", hint: "Instagram feed" },
  { value: "1:1", label: "Square", hint: "Feeds, LinkedIn" },
  { value: "16:9", label: "Landscape", hint: "YouTube, web" },
];

/**
 * The steps after upload, in order. A step is a `?step=` value on the project
 * page. "edit" is the template gallery and the word editor on one screen.
 */
export const STUDIO_STEPS = ["edit", "style", "export"] as const;
export type StudioStep = (typeof STUDIO_STEPS)[number];

export function parseStudioStep(raw: string | null | undefined): StudioStep {
  // "template" was its own step before it merged into "edit"; old links land there.
  return (STUDIO_STEPS as readonly string[]).includes(raw ?? "") ? (raw as StudioStep) : "edit";
}

/**
 * The document a new Studio project starts with: the whole video on the
 * timeline, in the chosen frame. "original" takes the video's own size.
 */
export function buildStudioDoc(opts: {
  assetId: string;
  durationSec: number;
  aspect: Aspect;
  /** The video's pixel size; required for "original". */
  videoSize?: { w: number; h: number } | null;
  captionStyle?: CaptionStyleOverride;
}): TimelineDoc {
  const video: VideoClip = {
    id: newClipId(),
    type: "video",
    assetId: opts.assetId,
    timelineStart: 0,
    duration: Math.max(0.5, opts.durationSec),
    srcIn: 0,
    volume: 1,
    muted: false,
  };
  const original = opts.aspect === "original" && opts.videoSize ? originalFrame(opts.videoSize.w, opts.videoSize.h) : null;
  return {
    ...DEFAULT_DOC,
    aspect: opts.aspect === "original" && !original ? "9:16" : opts.aspect,
    ...(original ? { size: original } : {}),
    ...(opts.captionStyle && Object.keys(opts.captionStyle).length ? { captionStyle: opts.captionStyle } : {}),
    tracks: { video: [video], text: [], audio: [], image: [], caption: [] },
  };
}

// Single words dropped by "Remove filler words". Whole-word only, after
// stripping punctuation, so "um," goes and "umbrella" stays. Multi-word
// fillers ("you know") are left alone: the words are separate cues' words and
// removing half a phrase reads worse than keeping it.
const FILLER_WORDS = new Set(["um", "umm", "uh", "uhh", "erm", "er", "hmm", "mm", "ah"]);

export function isFillerWord(word: string): boolean {
  return FILLER_WORDS.has(word.toLowerCase().replace(/[^\p{L}]/gu, ""));
}

/**
 * Transcript words → the doc's caption cues, every cue on `templateId`.
 * Keeps the editor's own grouping (wordsToCaptionCues), so a Studio project
 * opened in the editor looks the same.
 */
export function studioCaptionCues(
  words: RawWordTiming[],
  video: VideoClip,
  opts: { templateId: string; removeFillers: boolean },
): CaptionClip[] {
  const kept = opts.removeFillers ? words.filter((w) => !isFillerWord(w.word)) : words;
  return wordsToCaptionCues(kept, video, { templateId: opts.templateId, highlightMode: "none" });
}

/** Where an app draws its own UI over a vertical video, as fractions of the frame. */
export interface SafeZone {
  label: string;
  top: number;
  bottom: number;
  /** The column of like/comment/share buttons, from the right edge… */
  right: number;
  /** …over this vertical band only. */
  rightFrom: number;
  rightTo: number;
}

/**
 * Approximate, from each app's layout on a typical phone — the apps don't
 * publish exact numbers and move things between versions. A guide for
 * placing captions, not a guarantee.
 */
export const SAFE_ZONES: Record<"reels" | "tiktok" | "shorts", SafeZone> = {
  reels: { label: "Reels", top: 0.12, bottom: 0.2, right: 0.15, rightFrom: 0.45, rightTo: 0.8 },
  tiktok: { label: "TikTok", top: 0.12, bottom: 0.22, right: 0.17, rightFrom: 0.4, rightTo: 0.8 },
  shorts: { label: "Shorts", top: 0.1, bottom: 0.18, right: 0.14, rightFrom: 0.45, rightTo: 0.82 },
};

/** Every template cue moved to `templateId` (a pick in the edit step's template rail). */
export function withTemplate(doc: TimelineDoc, templateId: string): TimelineDoc {
  return {
    ...doc,
    tracks: { ...doc.tracks, caption: doc.tracks.caption.map((c) => ({ ...c, templateId })) },
  };
}

/** The template the project's cues use (the first cue's), if any. */
export function currentTemplateId(doc: TimelineDoc): string | null {
  return doc.tracks.caption.find((c) => c.templateId)?.templateId ?? null;
}
