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
  // Preview-only for now — browsable/selectable in the sidebar, not yet
  // applied by the render pipeline (see EFFECT_PRESETS/TRANSITION_PRESETS).
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

// Effect/Transition presets are UI-only for now (browsable + stored on the
// clip) — they are not yet applied by the render pipeline. Keeping them as
// plain label lists (no ffmpeg expression) makes that explicit.
export const EFFECT_PRESETS = {
  none: { label: "None" },
  shake: { label: "Shake" },
  zoomPulse: { label: "Zoom pulse" },
  glitch: { label: "Glitch" },
  filmGrain: { label: "Film grain" },
  bounce: { label: "Bounce" },
  flicker: { label: "Flicker" },
  vignettePulse: { label: "Vignette pulse" },
  chromaticAberration: { label: "Chromatic aberration" },
  oldFilm: { label: "Old film" },
} as const;
export type EffectPreset = keyof typeof EFFECT_PRESETS;

export const TRANSITION_PRESETS = {
  none: { label: "Cut (none)" },
  fade: { label: "Fade" },
  slideLeft: { label: "Slide left" },
  slideUp: { label: "Slide up" },
  zoomIn: { label: "Zoom in" },
  slideRight: { label: "Slide right" },
  slideDown: { label: "Slide down" },
  zoomOut: { label: "Zoom out" },
  wipe: { label: "Wipe" },
  dipToBlack: { label: "Dip to black" },
} as const;
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

export type AnyClip = VideoClip | TextClip | AudioClip | ImageClip;
export type TrackKind = "video" | "text" | "audio" | "image";

export interface TimelineDoc {
  version: 1;
  aspect: Aspect;
  fps: 30;
  tracks: {
    video: VideoClip[]; // sorted by timelineStart, non-overlapping
    text: TextClip[];
    audio: AudioClip[];
    image: ImageClip[]; // free-form overlay track, like text
  };
}

export const DEFAULT_DOC: TimelineDoc = {
  version: 1,
  aspect: "9:16",
  fps: 30,
  tracks: { video: [], text: [], audio: [], image: [] },
};

export const MIN_CLIP_DURATION = 0.05; // seconds
export const MAX_CLIPS_PER_TRACK = 50;
export const MAX_DOC_BYTES = 200_000;

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
  const d = doc as TimelineDoc;
  if (d.version !== 1) return "unsupported version";
  if (!ASPECT_DIMENSIONS[d.aspect]) return "invalid aspect";
  if (!d.tracks || typeof d.tracks !== "object") return "missing tracks";

  for (const kind of ["video", "text", "audio", "image"] as const) {
    const track = d.tracks[kind];
    if (!Array.isArray(track)) return `track ${kind} is not an array`;
    if (track.length > MAX_CLIPS_PER_TRACK) return `too many clips on ${kind} track`;
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

  if (JSON.stringify(doc).length > MAX_DOC_BYTES) return "doc too large";
  return null;
}
