// Editor catalogue: the options the web editor really has, copied so the phone
// offers the same ones (lib/editor/types.ts, lib/editor/ai-text.ts,
// app/dashboard/editor/components/panels/text/textPresets.ts). Pinned by
// lib/mobile-editor-schema.test.ts — it fails if the web list changes.

export type Option<T extends string = string> = { id: T; label: string };

export const EDITOR_ASPECTS = ["9:16", "1:1", "16:9"] as const;
export type EditorAspect = (typeof EDITOR_ASPECTS)[number];

export const EDITOR_FONTS = [
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
export type EditorFont = (typeof EDITOR_FONTS)[number];

export const EDITOR_FILTERS: Option[] = [
  { id: "none", label: "None" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "mono", label: "Mono" },
  { id: "vivid", label: "Vivid" },
  { id: "fade", label: "Fade" },
  { id: "noir", label: "Noir" },
  { id: "sunset", label: "Sunset" },
  { id: "tealOrange", label: "Teal & Orange" },
  { id: "softGlow", label: "Soft glow" },
];

export const EDITOR_EFFECTS: Option[] = [
  { id: "none", label: "None" },
  { id: "shake", label: "Shake" },
  { id: "zoomPulse", label: "Zoom pulse" },
  { id: "glitch", label: "Glitch" },
  { id: "filmGrain", label: "Film grain" },
  { id: "bounce", label: "Bounce" },
  { id: "flicker", label: "Flicker" },
  { id: "vignettePulse", label: "Vignette pulse" },
  { id: "chromaticAberration", label: "Chromatic aberration" },
  { id: "oldFilm", label: "Old film" },
];

export const EDITOR_TRANSITIONS: Option[] = [
  { id: "none", label: "Cut (none)" },
  { id: "fade", label: "Fade" },
  { id: "slideLeft", label: "Slide left" },
  { id: "slideUp", label: "Slide up" },
  { id: "zoomIn", label: "Zoom in" },
  { id: "slideRight", label: "Slide right" },
  { id: "slideDown", label: "Slide down" },
  { id: "zoomOut", label: "Zoom out" },
  { id: "wipe", label: "Wipe" },
  { id: "dipToBlack", label: "Dip to black" },
];

export const TEXT_ANIMATIONS: Option[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "pop", label: "Pop" },
  { id: "slideUp", label: "Slide up" },
  { id: "slideDown", label: "Slide down" },
  { id: "zoom", label: "Zoom" },
  { id: "bounce", label: "Bounce" },
  { id: "blur", label: "Blur" },
  { id: "typewriter", label: "Typewriter" },
];

/** "Add text" presets (the web's ADD_TEXT_PRESETS). */
export const TEXT_PRESETS: { label: string; font: EditorFont; sample: string }[] = [
  { label: "Heading", font: "Anton", sample: "Big Bold Heading" },
  { label: "Subheading", font: "Montserrat", sample: "Subheading text" },
  { label: "Body Text", font: "Arial", sample: "Body text goes here" },
  { label: "Animated Text", font: "Poppins", sample: "Animated text" },
  { label: "Lower Third", font: "Montserrat", sample: "Name · Title" },
  { label: "Caption", font: "Arial", sample: "Clean subtitle line" },
  { label: "Quote", font: "Playfair Display", sample: "“Something worth quoting”" },
];

/** Style templates (the web's TEXT_TEMPLATES). */
export const TEXT_STYLES = [
  "Modern Title",
  "YouTube Title",
  "Minimal",
  "Podcast",
  "Gaming",
  "Neon",
  "Corporate",
  "Cinematic",
  "Call To Action",
  "Social Media",
  "Bubble",
  "Bold Headline",
] as const;

export const CAPTION_HIGHLIGHTS: Option<"none" | "word" | "phrase" | "karaoke">[] = [
  { id: "none", label: "None" },
  { id: "word", label: "Word" },
  { id: "phrase", label: "Phrase" },
  { id: "karaoke", label: "Karaoke" },
];
export const CAPTION_POSITIONS: Option<"top" | "center" | "bottom">[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

/**
 * The editor's AI text operations (/api/editor/ai-text). Model ones are free
 * under a daily fair-use cap; the "instant" ones are plain string transforms.
 */
export const AI_TEXT_OPERATIONS: { id: string; label: string; instant: boolean }[] = [
  { id: "rewrite", label: "Rewrite", instant: false },
  { id: "grammar", label: "Fix grammar", instant: false },
  { id: "readability", label: "Improve readability", instant: false },
  { id: "shorten", label: "Shorten", instant: false },
  { id: "expand", label: "Expand", instant: false },
  { id: "viral", label: "Viral style", instant: false },
  { id: "translate", label: "Translate", instant: false },
  { id: "emojis", label: "Add emojis", instant: true },
  { id: "lineBreaks", label: "Auto line breaks", instant: true },
  { id: "fillerWords", label: "Remove filler words", instant: true },
];

/** Editor export: one render costs this many AI credits (lib/tool-costs.ts editor-render). */
export const EDITOR_EXPORT_CREDITS = 1;
/** Output: the aspect's 1080 frame at 30 fps; Free renders cap at 720p with a watermark. */
export const EXPORT_FPS = 30;
export function exportResolution(aspect: EditorAspect, free: boolean): string {
  const long = free ? 1280 : 1920;
  const short = free ? 720 : 1080;
  return aspect === "16:9" ? `${long}×${short}` : aspect === "1:1" ? `${short}×${short}` : `${short}×${long}`;
}
