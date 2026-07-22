// TimelineDoc: the single JSON document that describes an editor project.
// Stored in Project.editorDoc, edited by the Zustand store on the client, and
// re-validated server-side before rendering. Keep this file dependency-free —
// it is imported by both client components and the render job.

export type Aspect = "9:16" | "1:1" | "16:9";

export const ASPECT_DIMENSIONS: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

// Fonts available in the text panel. Client previews with the same family the
// server burns in, so the whitelist is the parity contract between the two.
// The first three are OS-installed system fonts; the rest are Google Fonts
// bundled as static files under public/fonts (see filtergraph.ts's FONT_FILES
// and app/layout.tsx's @font-face block) so preview and export stay in sync
// without depending on any font being present on the machine.
export const FONT_WHITELIST = [
  "Arial",
  "Impact",
  "Times New Roman",
  "Poppins",
  "Montserrat",
  "Bebas Neue",
  "Oswald",
  "Playfair Display",
  "Anton",
] as const;
export type FontFamily = (typeof FONT_WHITELIST)[number];

export interface ClipBase {
  id: string; // uuid
  timelineStart: number; // seconds on the timeline
  duration: number; // seconds on the timeline
  locked?: boolean; // when true, timeline drag/trim is disabled (still selectable)
  hidden?: boolean; // when true, excluded from live preview AND export
  name?: string; // user-set label; falls back to clip content when unset
}

// Structural stand-in for Lexical's SerializedEditorState. Deliberately not
// importing from `lexical` here — this file must stay dependency-free (see
// header comment), since it's shared by both client components and the
// server render job. Only shallow-shape validated by validateDoc(); the real
// reader/writer lives in Lexical-aware client code under components/text/ and
// properties/text/.
export type RichTextState = { root: unknown; [k: string]: unknown };

// Color-filter presets. Preview uses the css value; export uses the ffmpeg
// filter expression — both tuned to look as close as practical.
export const FILTER_PRESETS = {
  none: { label: "None", css: "none", ffmpeg: null },
  warm: { label: "Warm", css: "sepia(0.25) saturate(1.25)", ffmpeg: "colorbalance=rs=0.12:gs=0.02:bs=-0.12,eq=saturation=1.2" },
  cool: { label: "Cool", css: "saturate(1.1) hue-rotate(-8deg) brightness(1.02)", ffmpeg: "colorbalance=rs=-0.1:bs=0.12,eq=saturation=1.1:brightness=0.01" },
  mono: { label: "Mono", css: "grayscale(1) contrast(1.05)", ffmpeg: "hue=s=0,eq=contrast=1.05" },
  vivid: { label: "Vivid", css: "saturate(1.5) contrast(1.1)", ffmpeg: "eq=saturation=1.5:contrast=1.1" },
  fade: { label: "Fade", css: "contrast(0.85) saturate(0.85) brightness(1.05)", ffmpeg: "eq=contrast=0.85:saturation=0.85:brightness=0.03" },
  noir: { label: "Noir", css: "grayscale(1) contrast(1.3) brightness(0.95)", ffmpeg: "hue=s=0,eq=contrast=1.3:brightness=-0.03" },
  sunset: { label: "Sunset", css: "sepia(0.35) saturate(1.4) hue-rotate(-10deg)", ffmpeg: "colorbalance=rs=0.18:gs=0.05:bs=-0.15,eq=saturation=1.3" },
  tealOrange: { label: "Teal & Orange", css: "saturate(1.3) hue-rotate(8deg) contrast(1.08)", ffmpeg: "colorbalance=rs=0.08:bs=0.1:gs=-0.02,eq=saturation=1.25:contrast=1.08" },
  softGlow: { label: "Soft glow", css: "brightness(1.08) contrast(0.9) saturate(1.05)", ffmpeg: "eq=brightness=0.05:contrast=0.9:saturation=1.05" },
} as const;
export type FilterPreset = keyof typeof FILTER_PRESETS;

export const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;
export const MAX_FADE_SEC = 3;

export interface VideoClip extends ClipBase {
  type: "video";
  assetId: string; // Asset.id — server re-resolves the S3 key, never trusts URLs
  srcIn: number; // trim-in inside the source file, seconds
  volume: number; // 0..1
  muted: boolean;
  // Phase 2 fields — all optional so v1 docs stay valid.
  speed?: number; // playback rate 0.25..4 (default 1). Source consumed = duration * speed.
  fadeIn?: number; // fade-from-black seconds at clip start (0..MAX_FADE_SEC)
  fadeOut?: number; // fade-to-black seconds at clip end
  filter?: FilterPreset; // color preset (default "none")
  // Applied at export by filtergraph.ts (see EFFECT_PRESETS/TRANSITION_PRESETS).
  effect?: EffectPreset;
  transitionOut?: TransitionPreset;
}

export interface TextClip extends ClipBase {
  type: "text";
  text: string; // flat plain-text projection, auto-synced from richText — what drawtext/export consumes. Never hand-edited once richText exists.
  richText?: RichTextState; // Lexical SerializedEditorState — source of truth for rich editing/preview. Undefined = legacy clip, falls back to `text`.
  fontFamily: FontFamily;
  fontSizePct: number; // % of canvas HEIGHT (0..1) — resolution independent
  color: string; // #rrggbb
  bold: boolean; // whole-clip base/dominant bold — also the export-flattening fallback for mixed-run bold set via the rich editor
  align: "left" | "center" | "right"; // wired into real export (filtergraph.ts) — see x/y semantics note there
  x: number; // 0..1 normalized position — center point when align="center", left/right anchor otherwise
  y: number; // 0..1 normalized center position
  bgColor: string | null; // optional pill background behind the text

  // ── Exported for real (filtergraph.ts honors these via native drawtext options) ──
  strokeColor?: string | null; // #rrggbb; null/undefined = no stroke
  strokeWidthPct?: number; // 0..0.05, % of canvas height (resolution-independent, mirrors fontSizePct)
  shadow?: {
    color: string; // #rrggbb
    offsetXPct: number; // signed, % of canvas width
    offsetYPct: number; // signed, % of canvas height
    opacity: number; // 0..1
    blurPx?: number; // PREVIEW-ONLY softening (CSS text-shadow blur) — drawtext has no blur, ignored at export
  } | null;
  opacity?: number; // 0..1, default 1 when unset (backward-compat with pre-existing docs) — drawtext `alpha`
  lineHeight?: number; // multiplier, default 1.2; 0.8..3 — approximated via drawtext `line_spacing`
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"; // default "none" — real string transform before export

  // ── Preview-only (validated for shape/range, ignored by filtergraph.ts) ──
  gradient?: { from: string; to: string; angleDeg: number } | null; // CSS background-clip:text; export falls back to flat `color`
  letterSpacingPx?: number; // -5..30
  rotationDeg?: number; // -180..180
  entrance?: { type: TextEntrancePreset; duration: number; delay: number } | null;
  loop?: { type: TextLoopPreset; speed: number } | null;
  exit?: { type: TextExitPreset; duration: number; delay: number } | null;
}

export interface AudioClip extends ClipBase {
  type: "audio";
  assetId: string;
  srcIn: number;
  volume: number; // 0..1
}

// Image overlay clip. Also used for stickers (same shape, just a smaller
// default scalePct) — both are "a positioned image on top of the frame" so
// they share one track/type rather than a fourth near-duplicate one.
export interface ImageClip extends ClipBase {
  type: "image";
  assetId: string;
  x: number; // 0..1 normalized center position
  y: number; // 0..1 normalized center position
  scalePct: number; // relative to canvas width; 1 = fills the frame width
  opacity: number; // 0..1
  fadeIn?: number;
  fadeOut?: number;
}

// Effect presets — applied for real at export. `ffmpeg` builds the filter
// string for the render pipeline (a function because several effects need the
// concrete output dimensions, which vary by aspect); `css` is the preview
// approximation applied by PreviewStage (an animation class where a static
// filter can't convey motion). The chain runs after each clip is normalized
// to fps=30 / W×H / setsar=1, so expressions may rely on those dimensions.
type EffectDef = { label: string; ffmpeg: ((w: number, h: number) => string) | null; previewClass?: string };
export const EFFECT_PRESETS = {
  none: { label: "None", ffmpeg: null, previewClass: undefined },
  shake: {
    label: "Shake",
    ffmpeg: (w, h) =>
      `scale=iw*1.04:ih*1.04,crop=${w}:${h}:x='(iw-${w})/2+(iw-${w})/2*sin(t*13)':y='(ih-${h})/2+(ih-${h})/2*cos(t*19)'`,
    previewClass: "fx-shake",
  },
  zoomPulse: {
    label: "Zoom pulse",
    ffmpeg: (w, h) =>
      `zoompan=z='1.03+0.03*sin(in/15)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=30`,
    previewClass: "fx-zoom-pulse",
  },
  glitch: {
    label: "Glitch",
    ffmpeg: () =>
      `rgbashift=rh=6:bh=-6:enable='lt(mod(t,0.7),0.12)',noise=alls=18:allf=t:enable='lt(mod(t,0.7),0.12)'`,
    previewClass: "fx-glitch",
  },
  filmGrain: { label: "Film grain", ffmpeg: () => `noise=alls=12:allf=t+u`, previewClass: "fx-film-grain" },
  bounce: {
    label: "Bounce",
    ffmpeg: (w, h) =>
      `scale=iw*1.04:ih*1.04,crop=${w}:${h}:x='(iw-${w})/2':y='(ih-${h})/2+(ih-${h})/2*abs(sin(t*5))'`,
    previewClass: "fx-bounce",
  },
  flicker: {
    label: "Flicker",
    ffmpeg: () => `eq=eval=frame:brightness='0.06*sin(t*10)'`,
    previewClass: "fx-flicker",
  },
  vignettePulse: {
    label: "Vignette pulse",
    ffmpeg: () => `vignette=angle='PI/4+PI/20*sin(t*3)':eval=frame`,
    previewClass: "fx-vignette-pulse",
  },
  chromaticAberration: {
    label: "Chromatic aberration",
    ffmpeg: () => `rgbashift=rh=4:bh=-4`,
    previewClass: "fx-chromatic",
  },
  oldFilm: {
    label: "Old film",
    ffmpeg: () => `hue=s=0.35,eq=contrast=1.1:brightness=0.02,noise=alls=14:allf=t+u,vignette`,
    previewClass: "fx-old-film",
  },
} satisfies Record<string, EffectDef>;
export type EffectPreset = keyof typeof EFFECT_PRESETS;

// Transition presets — applied for real at export via ffmpeg `xfade`. The
// outgoing clip is extended with a freeze-frame (`tpad`) so the crossfade
// never eats into either clip's timeline duration (overlay/caption/music
// timings stay valid). `xfade: null` = not yet supported by the pipeline
// (hidden in the picker).
export const TRANSITION_DURATION_SEC = 0.5;
export const TRANSITION_PRESETS = {
  none: { label: "Cut (none)", xfade: null },
  fade: { label: "Fade", xfade: "fade" },
  slideLeft: { label: "Slide left", xfade: "slideleft" },
  slideUp: { label: "Slide up", xfade: "slideup" },
  zoomIn: { label: "Zoom in", xfade: "zoomin" },
  slideRight: { label: "Slide right", xfade: "slideright" },
  slideDown: { label: "Slide down", xfade: "slidedown" },
  zoomOut: { label: "Zoom out", xfade: null },
  wipe: { label: "Wipe", xfade: "wipeleft" },
  dipToBlack: { label: "Dip to black", xfade: "fadeblack" },
} satisfies Record<string, { label: string; xfade: string | null }>;
export type TransitionPreset = keyof typeof TRANSITION_PRESETS;

// Text animation presets — PREVIEW-ONLY (see TextClip.entrance/loop/exit).
// Live preview drives these via components/text/textAnimations.ts; the
// render pipeline (filtergraph.ts) does not apply them.
export const TEXT_ENTRANCE_PRESETS = {
  none: { label: "None" },
  fade: { label: "Fade" },
  pop: { label: "Pop" },
  slideUp: { label: "Slide up" },
  slideDown: { label: "Slide down" },
  zoom: { label: "Zoom" },
  bounce: { label: "Bounce" },
  blur: { label: "Blur" },
  typewriter: { label: "Typewriter" },
} as const;
export type TextEntrancePreset = keyof typeof TEXT_ENTRANCE_PRESETS;

export const TEXT_LOOP_PRESETS = {
  none: { label: "None" },
  float: { label: "Float" },
  pulse: { label: "Pulse" },
  wiggle: { label: "Wiggle" },
  glow: { label: "Glow" },
} as const;
export type TextLoopPreset = keyof typeof TEXT_LOOP_PRESETS;

export const TEXT_EXIT_PRESETS = {
  none: { label: "None" },
  fade: { label: "Fade" },
  slide: { label: "Slide" },
  zoom: { label: "Zoom" },
} as const;
export type TextExitPreset = keyof typeof TEXT_EXIT_PRESETS;

// ── Captions — timeline-synced subtitles, deliberately NOT TextClip/Lexical.
// A caption "cue" is a short flat string (optionally with word-level timing
// for karaoke), styled/positioned/animated much like TextClip, but edited via
// a dedicated timeline-based panel, not rich text editing. See CaptionClip.

export interface CaptionWord {
  word: string;
  startMs: number; // CLIP-RELATIVE: 0 = this cue's own timelineStart
  endMs: number;
}

export const CAPTION_HIGHLIGHT_MODES = {
  none: { label: "None" },
  word: { label: "Word" }, // hard-cut per-word color switch
  phrase: { label: "Phrase" }, // whole cue highlights together
  karaoke: { label: "Karaoke" }, // progressive per-word fill sweep
} as const;
export type CaptionHighlightMode = keyof typeof CAPTION_HIGHLIGHT_MODES;

export const CAPTION_POSITION_PRESETS = {
  top: { label: "Top" },
  center: { label: "Center" },
  bottom: { label: "Bottom" },
  custom: { label: "Custom" },
} as const;
export type CaptionPositionPreset = keyof typeof CAPTION_POSITION_PRESETS;

export interface CaptionClip extends ClipBase {
  type: "caption";
  text: string;
  words?: CaptionWord[]; // absent = manually-typed cue, no karaoke data; highlightMode should be "none" for these

  fontFamily: FontFamily;
  fontSizePct: number;
  color: string; // #rrggbb
  bold: boolean;
  bgColor: string | null; // PREVIEW-ONLY — ASS has no simple per-line background-box override tag; ignored by caption-ass.ts

  // ── Exported for real (caption-ass.ts honors these via ASS override tags) ──
  strokeColor?: string | null;
  strokeWidthPct?: number;
  shadow?: {
    color: string;
    offsetXPct: number;
    offsetYPct: number;
    opacity: number;
    blurPx?: number; // PREVIEW-ONLY, same as TextClip.shadow
  } | null;
  opacity?: number;
  lineHeight?: number;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";

  // ── Preview-only ──
  letterSpacingPx?: number;

  x: number; // 0..1 normalized center position — same semantics as TextClip
  y: number;
  positionPreset?: CaptionPositionPreset; // UI convenience; picking one writes derived x/y
  safeMarginPct?: number; // 0..0.2, used by top/bottom presets

  highlightMode: CaptionHighlightMode;
  highlightColor?: string; // #rrggbb
  activeWordScale?: number; // 1..2, PREVIEW-ONLY
  activeWordOpacity?: number; // 0..1, PREVIEW-ONLY
  highlightSpeed?: number; // 0.25..3, REAL — scales exported \k/\kf durations too

  // Reuses TextClip's animation presets — preview-only, same as TextClip.
  entrance?: { type: TextEntrancePreset; duration: number; delay: number } | null;
  loop?: { type: TextLoopPreset; speed: number } | null;
  exit?: { type: TextExitPreset; duration: number; delay: number } | null;
}

export type AnyClip = VideoClip | TextClip | AudioClip | ImageClip | CaptionClip;
export type TrackKind = "video" | "text" | "audio" | "image" | "caption";

export interface TimelineDoc {
  version: 1;
  aspect: Aspect;
  fps: 30;
  tracks: {
    video: VideoClip[]; // sorted by timelineStart, non-overlapping
    text: TextClip[];
    audio: AudioClip[];
    image: ImageClip[]; // free-form overlay track, like text
    caption: CaptionClip[]; // sorted by timelineStart, non-overlapping — like video, real subtitle cues don't overlap
  };
}

export const DEFAULT_DOC: TimelineDoc = {
  version: 1,
  aspect: "9:16",
  fps: 30,
  tracks: { video: [], text: [], audio: [], image: [], caption: [] },
};

export const MIN_CLIP_DURATION = 0.05; // seconds
export const MAX_CLIPS_PER_TRACK = 50;
// Cues (grouped lines), not words — a video generates roughly one cue per
// 2-4s of speech, so even a very long video stays well under this.
export const MAX_CAPTION_CLIPS_PER_TRACK = 1000;
// Was 200_000 — captions carry a words[] sub-array per cue (~450-500 bytes/cue
// including style fields), so up to 1000 cues alone can reach ~450-500KB;
// this gives ~2x headroom over that realistic worst case.
export const MAX_DOC_BYTES = 1_000_000;

/** Backfills any track arrays missing from an older saved doc (e.g. one
 *  predating the caption track) so validateDoc()/every downstream reader can
 *  assume all five track arrays always exist. `doc.tracks` is treated as
 *  possibly-partial here even though TimelineDoc's own type claims it's always
 *  complete — that claim is exactly what old, pre-caption-track saved JSON
 *  violates at runtime, which is the whole reason this function exists. */
export function normalizeDoc(doc: TimelineDoc): TimelineDoc {
  const tracks = doc.tracks as Partial<TimelineDoc["tracks"]> | undefined;
  return { ...doc, tracks: { video: [], text: [], audio: [], image: [], caption: [], ...tracks } };
}

// ── Validation (shared client/server; server calls this before rendering) ──

function isFiniteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function validateBase(c: ClipBase): string | null {
  if (typeof c.id !== "string" || !c.id) return "clip missing id";
  if (!isFiniteNonNeg(c.timelineStart)) return "invalid timelineStart";
  if (!isFiniteNonNeg(c.duration) || c.duration < MIN_CLIP_DURATION) return "invalid duration";
  if (c.locked !== undefined && typeof c.locked !== "boolean") return "invalid locked";
  if (c.hidden !== undefined && typeof c.hidden !== "boolean") return "invalid hidden";
  if (c.name !== undefined && (typeof c.name !== "string" || c.name.length > 200)) return "invalid name";
  return null;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function isFiniteInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
}

/** Returns null if valid, otherwise a human-readable error string. */
export function validateDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object") return "doc is not an object";
  if ((doc as TimelineDoc).version !== 1) return "unsupported version";
  const d = normalizeDoc(doc as TimelineDoc); // backfills missing track arrays (e.g. pre-caption-track saved docs)
  if (!ASPECT_DIMENSIONS[d.aspect]) return "invalid aspect";
  if (!d.tracks || typeof d.tracks !== "object") return "missing tracks";

  for (const kind of ["video", "text", "audio", "image", "caption"] as const) {
    const track = d.tracks[kind];
    if (!Array.isArray(track)) return `track ${kind} is not an array`;
    const cap = kind === "caption" ? MAX_CAPTION_CLIPS_PER_TRACK : MAX_CLIPS_PER_TRACK;
    if (track.length > cap) return `too many clips on ${kind} track`;
    for (const clip of track) {
      const baseErr = validateBase(clip);
      if (baseErr) return `${kind}: ${baseErr}`;
      if (clip.type !== kind) return `${kind}: wrong clip type`;
    }
  }

  // Video track must be sorted and non-overlapping (small float tolerance).
  const vids = d.tracks.video;
  for (let i = 1; i < vids.length; i++) {
    const prevEnd = vids[i - 1].timelineStart + vids[i - 1].duration;
    if (vids[i].timelineStart < prevEnd - 0.001) return "video clips overlap or are unsorted";
  }

  // Caption cues, like video clips, model real (non-overlapping) subtitle timing.
  const caps = d.tracks.caption;
  for (let i = 1; i < caps.length; i++) {
    const prevEnd = caps[i - 1].timelineStart + caps[i - 1].duration;
    if (caps[i].timelineStart < prevEnd - 0.001) return "caption clips overlap or are unsorted";
  }

  for (const v of d.tracks.video) {
    if (typeof v.assetId !== "string" || !v.assetId) return "video clip missing assetId";
    if (!isFiniteNonNeg(v.srcIn)) return "video clip invalid srcIn";
    if (typeof v.volume !== "number" || v.volume < 0 || v.volume > 1) return "video clip invalid volume";
    if (v.speed !== undefined && (typeof v.speed !== "number" || v.speed < 0.25 || v.speed > 4)) return "video clip invalid speed";
    if (v.fadeIn !== undefined && (!isFiniteNonNeg(v.fadeIn) || v.fadeIn > MAX_FADE_SEC)) return "video clip invalid fadeIn";
    if (v.fadeOut !== undefined && (!isFiniteNonNeg(v.fadeOut) || v.fadeOut > MAX_FADE_SEC)) return "video clip invalid fadeOut";
    if (v.filter !== undefined && !(v.filter in FILTER_PRESETS)) return "video clip invalid filter";
    if (v.effect !== undefined && !(v.effect in EFFECT_PRESETS)) return "video clip invalid effect";
    if (v.transitionOut !== undefined && !(v.transitionOut in TRANSITION_PRESETS)) return "video clip invalid transitionOut";
  }
  for (const t of d.tracks.text) {
    if (typeof t.text !== "string") return "text clip missing text";
    if (!FONT_WHITELIST.includes(t.fontFamily)) return "text clip font not allowed";
    if (typeof t.fontSizePct !== "number" || t.fontSizePct <= 0 || t.fontSizePct > 0.5) return "text clip invalid fontSizePct";
    if (!HEX_COLOR.test(t.color)) return "text clip invalid color";
    if (t.bgColor !== null && !HEX_COLOR.test(t.bgColor)) return "text clip invalid bgColor";
    if (typeof t.x !== "number" || t.x < 0 || t.x > 1 || typeof t.y !== "number" || t.y < 0 || t.y > 1)
      return "text clip invalid position";
    if (t.align !== undefined && !["left", "center", "right"].includes(t.align)) return "text clip invalid align";

    // Shallow structural check only — this file stays Lexical-free.
    if (t.richText !== undefined && (typeof t.richText !== "object" || t.richText === null || !("root" in t.richText)))
      return "text clip invalid richText";

    if (t.strokeColor !== undefined && t.strokeColor !== null && !HEX_COLOR.test(t.strokeColor))
      return "text clip invalid strokeColor";
    if (t.strokeWidthPct !== undefined && !isFiniteInRange(t.strokeWidthPct, 0, 0.05))
      return "text clip invalid strokeWidthPct";
    if (t.shadow !== undefined && t.shadow !== null) {
      const s = t.shadow;
      if (
        typeof s !== "object" ||
        !HEX_COLOR.test(s.color) ||
        !isFiniteInRange(s.offsetXPct, -1, 1) ||
        !isFiniteInRange(s.offsetYPct, -1, 1) ||
        !isFiniteInRange(s.opacity, 0, 1) ||
        (s.blurPx !== undefined && !isFiniteInRange(s.blurPx, 0, 100))
      )
        return "text clip invalid shadow";
    }
    if (t.opacity !== undefined && !isFiniteInRange(t.opacity, 0, 1)) return "text clip invalid opacity";
    if (t.lineHeight !== undefined && !isFiniteInRange(t.lineHeight, 0.8, 3)) return "text clip invalid lineHeight";
    if (t.textTransform !== undefined && !["none", "uppercase", "lowercase", "capitalize"].includes(t.textTransform))
      return "text clip invalid textTransform";

    if (t.gradient !== undefined && t.gradient !== null) {
      const g = t.gradient;
      if (typeof g !== "object" || !HEX_COLOR.test(g.from) || !HEX_COLOR.test(g.to) || !isFiniteInRange(g.angleDeg, -360, 360))
        return "text clip invalid gradient";
    }
    if (t.letterSpacingPx !== undefined && !isFiniteInRange(t.letterSpacingPx, -5, 30))
      return "text clip invalid letterSpacingPx";
    if (t.rotationDeg !== undefined && !isFiniteInRange(t.rotationDeg, -180, 180))
      return "text clip invalid rotationDeg";

    for (const [field, presets] of [
      ["entrance", TEXT_ENTRANCE_PRESETS],
      ["exit", TEXT_EXIT_PRESETS],
    ] as const) {
      const v = t[field];
      if (v === undefined || v === null) continue;
      if (typeof v !== "object" || !(v.type in presets) || !isFiniteNonNeg(v.duration) || !isFiniteNonNeg(v.delay))
        return `text clip invalid ${field}`;
    }
    if (t.loop !== undefined && t.loop !== null) {
      const l = t.loop;
      if (typeof l !== "object" || !(l.type in TEXT_LOOP_PRESETS) || !isFiniteInRange(l.speed, 0.1, 5))
        return "text clip invalid loop";
    }
  }
  for (const a of d.tracks.audio) {
    if (typeof a.assetId !== "string" || !a.assetId) return "audio clip missing assetId";
    if (!isFiniteNonNeg(a.srcIn)) return "audio clip invalid srcIn";
    if (typeof a.volume !== "number" || a.volume < 0 || a.volume > 1) return "audio clip invalid volume";
  }
  for (const im of d.tracks.image) {
    if (typeof im.assetId !== "string" || !im.assetId) return "image clip missing assetId";
    if (typeof im.x !== "number" || im.x < 0 || im.x > 1 || typeof im.y !== "number" || im.y < 0 || im.y > 1)
      return "image clip invalid position";
    if (typeof im.scalePct !== "number" || im.scalePct <= 0 || im.scalePct > 3) return "image clip invalid scalePct";
    if (typeof im.opacity !== "number" || im.opacity < 0 || im.opacity > 1) return "image clip invalid opacity";
    if (im.fadeIn !== undefined && (!isFiniteNonNeg(im.fadeIn) || im.fadeIn > MAX_FADE_SEC)) return "image clip invalid fadeIn";
    if (im.fadeOut !== undefined && (!isFiniteNonNeg(im.fadeOut) || im.fadeOut > MAX_FADE_SEC)) return "image clip invalid fadeOut";
  }
  for (const c of d.tracks.caption) {
    if (typeof c.text !== "string") return "caption clip missing text";
    if (!FONT_WHITELIST.includes(c.fontFamily)) return "caption clip font not allowed";
    if (typeof c.fontSizePct !== "number" || c.fontSizePct <= 0 || c.fontSizePct > 0.5) return "caption clip invalid fontSizePct";
    if (!HEX_COLOR.test(c.color)) return "caption clip invalid color";
    if (c.bgColor !== null && !HEX_COLOR.test(c.bgColor)) return "caption clip invalid bgColor";
    if (typeof c.x !== "number" || c.x < 0 || c.x > 1 || typeof c.y !== "number" || c.y < 0 || c.y > 1)
      return "caption clip invalid position";

    if (c.strokeColor !== undefined && c.strokeColor !== null && !HEX_COLOR.test(c.strokeColor))
      return "caption clip invalid strokeColor";
    if (c.strokeWidthPct !== undefined && !isFiniteInRange(c.strokeWidthPct, 0, 0.05))
      return "caption clip invalid strokeWidthPct";
    if (c.shadow !== undefined && c.shadow !== null) {
      const s = c.shadow;
      if (
        typeof s !== "object" ||
        !HEX_COLOR.test(s.color) ||
        !isFiniteInRange(s.offsetXPct, -1, 1) ||
        !isFiniteInRange(s.offsetYPct, -1, 1) ||
        !isFiniteInRange(s.opacity, 0, 1) ||
        (s.blurPx !== undefined && !isFiniteInRange(s.blurPx, 0, 100))
      )
        return "caption clip invalid shadow";
    }
    if (c.opacity !== undefined && !isFiniteInRange(c.opacity, 0, 1)) return "caption clip invalid opacity";
    if (c.lineHeight !== undefined && !isFiniteInRange(c.lineHeight, 0.8, 3)) return "caption clip invalid lineHeight";
    if (c.textTransform !== undefined && !["none", "uppercase", "lowercase", "capitalize"].includes(c.textTransform))
      return "caption clip invalid textTransform";
    if (c.letterSpacingPx !== undefined && !isFiniteInRange(c.letterSpacingPx, -5, 30))
      return "caption clip invalid letterSpacingPx";

    if (c.positionPreset !== undefined && !(c.positionPreset in CAPTION_POSITION_PRESETS))
      return "caption clip invalid positionPreset";
    if (c.safeMarginPct !== undefined && !isFiniteInRange(c.safeMarginPct, 0, 0.2))
      return "caption clip invalid safeMarginPct";

    if (!(c.highlightMode in CAPTION_HIGHLIGHT_MODES)) return "caption clip invalid highlightMode";
    if (c.highlightColor !== undefined && !HEX_COLOR.test(c.highlightColor)) return "caption clip invalid highlightColor";
    if (c.activeWordScale !== undefined && !isFiniteInRange(c.activeWordScale, 1, 2))
      return "caption clip invalid activeWordScale";
    if (c.activeWordOpacity !== undefined && !isFiniteInRange(c.activeWordOpacity, 0, 1))
      return "caption clip invalid activeWordOpacity";
    if (c.highlightSpeed !== undefined && !isFiniteInRange(c.highlightSpeed, 0.25, 3))
      return "caption clip invalid highlightSpeed";

    if (c.words !== undefined) {
      if (!Array.isArray(c.words)) return "caption clip invalid words";
      for (const w of c.words) {
        if (
          typeof w !== "object" ||
          typeof w.word !== "string" ||
          !isFiniteNonNeg(w.startMs) ||
          !isFiniteNonNeg(w.endMs) ||
          w.startMs > w.endMs
        )
          return "caption clip invalid word timing";
      }
    }

    for (const [field, presets] of [
      ["entrance", TEXT_ENTRANCE_PRESETS],
      ["exit", TEXT_EXIT_PRESETS],
    ] as const) {
      const v = c[field];
      if (v === undefined || v === null) continue;
      if (typeof v !== "object" || !(v.type in presets) || !isFiniteNonNeg(v.duration) || !isFiniteNonNeg(v.delay))
        return `caption clip invalid ${field}`;
    }
    if (c.loop !== undefined && c.loop !== null) {
      const l = c.loop;
      if (typeof l !== "object" || !(l.type in TEXT_LOOP_PRESETS) || !isFiniteInRange(l.speed, 0.1, 5))
        return "caption clip invalid loop";
    }
  }

  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return "doc too large";
  return null;
}
