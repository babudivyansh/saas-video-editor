// Track-based editor document — the v2 multi-track format.
// Stored in Project.editorDoc as { _v: 2, ...TrackDoc }.
// The v1 EditorDoc format (simple/old advanced editor) remains in editor-types.ts.

export type TrackAspect = "9:16" | "16:9" | "1:1" | "4:5";
export type TrackKind = "video" | "audio" | "text" | "effect";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
export type SidebarTab =
  | "media"
  | "templates"
  | "captions"
  | "effects"
  | "transitions"
  | "stickers"
  | "audio"
  | "ai"
  | "brand";

export type TextAnimation =
  | "none"
  | "fade-in"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "typewriter"
  | "bounce";

export type TransitionType =
  | "fade"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "blur"
  | "glitch"
  | "whip-pan"
  | "flash"
  | "spin";

export type EffectId =
  | "cinematic"
  | "vhs"
  | "glitch"
  | "blur"
  | "rgb-split"
  | "film-grain"
  | "retro"
  | "neon"
  | "viral-zoom"
  | "punch-in"
  | "face-focus"
  | "dynamic-crop"
  | "zoom"
  | "pan"
  | "slide"
  | "rotate"
  | "bounce"
  | "shake";

// ─── Clip data (discriminated by kind) ───────────────────────────────────────

export interface VideoClipData {
  kind: "video";
  url: string;
  // Transform (0.5 = center; values are fraction of the canvas dimensions)
  posX: number;
  posY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;  // degrees
  opacity: number;   // 0–1
  blur: number;      // px
  speed: number;     // 1.0 = normal
  // Color grading
  brightness: number; // 0–2, 1 = normal
  contrast: number;
  saturation: number;
  // Applied effects
  effects: EffectId[];
}

export interface AudioClipData {
  kind: "audio";
  url: string;
  volume: number;    // 0–2
  fadeIn: number;    // seconds
  fadeOut: number;   // seconds
  muted: boolean;
}

export interface TextClipData {
  kind: "text";
  text: string;
  fontFamily: string;
  fontSize: number;   // relative px (1080-width baseline)
  color: string;      // hex
  backgroundColor: string;
  backgroundOpacity: number; // 0–1
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  posX: number;       // 0–1 fraction of frame
  posY: number;
  animation: TextAnimation;
  stroke: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
}

export interface TransitionClipData {
  kind: "transition";
  transitionType: TransitionType;
}

export interface EffectClipData {
  kind: "effect";
  effectId: EffectId;
  params: Record<string, number>; // effect-specific knob values
}

export type ClipData =
  | VideoClipData
  | AudioClipData
  | TextClipData
  | TransitionClipData
  | EffectClipData;

// ─── Core clip ───────────────────────────────────────────────────────────────

export interface Clip {
  id: string;
  trackId: string;
  start: number;    // timeline position (seconds)
  duration: number; // how long it occupies on the timeline
  srcIn: number;    // source file in-point (seconds; for trimming/slipping)
  srcOut: number;   // source file out-point (seconds)
  data: ClipData;
}

// ─── Track ───────────────────────────────────────────────────────────────────

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  clips: Clip[];
}

// ─── Marker ──────────────────────────────────────────────────────────────────

export interface Marker {
  id: string;
  time: number;
  label: string;
  color: string;
}

// ─── Root document ───────────────────────────────────────────────────────────

export interface TrackDoc {
  _v: 2;
  aspect: TrackAspect;
  fps: 30 | 60;
  tracks: Track[];
  markers: Marker[];
}

// ─── Caption segment (shared with Whisper output) ────────────────────────────

export interface CaptionSegment {
  word: string;
  start: number; // ms
  end: number;   // ms
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _idCounter = 0;
export function uid(): string {
  return `${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

export function emptyVideoClipData(url: string): VideoClipData {
  return {
    kind: "video",
    url,
    posX: 0.5,
    posY: 0.5,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blur: 0,
    speed: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    effects: [],
  };
}

export function emptyTextClipData(text = "New Text"): TextClipData {
  return {
    kind: "text",
    text,
    fontFamily: "Arial, sans-serif",
    fontSize: 64,
    color: "#ffffff",
    backgroundColor: "transparent",
    backgroundOpacity: 0,
    bold: true,
    italic: false,
    uppercase: false,
    posX: 0.5,
    posY: 0.5,
    animation: "none",
    stroke: true,
    strokeColor: "#000000",
    strokeWidth: 2,
    shadow: false,
    shadowColor: "#000000",
  };
}

export function emptyAudioClipData(url: string): AudioClipData {
  return {
    kind: "audio",
    url,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
  };
}

export function emptyTrackDoc(): TrackDoc {
  return {
    _v: 2,
    aspect: "9:16",
    fps: 30,
    tracks: [
      { id: uid(), kind: "video", name: "Video 1", locked: false, hidden: false, muted: false, clips: [] },
      { id: uid(), kind: "audio", name: "Audio 1", locked: false, hidden: false, muted: false, clips: [] },
    ],
    markers: [],
  };
}

// Compute total timeline duration from all clip end times
export function computeDuration(doc: TrackDoc): number {
  let max = 0;
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const end = clip.start + clip.duration;
      if (end > max) max = end;
    }
  }
  return Math.max(max, 10); // minimum 10s
}

// Find a clip by ID across all tracks
export function findClip(doc: TrackDoc, clipId: string): { track: Track; clip: Clip } | null {
  for (const track of doc.tracks) {
    const clip = track.clips.find(c => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

// Find all clips active at a given time
export function activeClipsAt(doc: TrackDoc, time: number): Clip[] {
  const result: Clip[] = [];
  for (const track of doc.tracks) {
    if (track.hidden) continue;
    for (const clip of track.clips) {
      if (time >= clip.start && time < clip.start + clip.duration) {
        result.push(clip);
      }
    }
  }
  return result;
}

// Canvas dimensions for each aspect ratio
export const ASPECT_DIMENSIONS: Record<TrackAspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "16:9": { w: 1920, h: 1080 },
  "1:1":  { w: 1080, h: 1080 },
  "4:5":  { w: 1080, h: 1350 },
};

export const ASPECT_LABELS: Record<TrackAspect, string> = {
  "9:16": "9:16 · Reels",
  "16:9": "16:9 · YouTube",
  "1:1":  "1:1 · Square",
  "4:5":  "4:5 · Feed",
};
