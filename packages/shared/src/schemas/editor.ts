import { z } from "zod";
import { validateDoc, type TimelineDoc } from "../editor/timeline";
import { assetSchema } from "./assets";

// Editor catalogue: the options the web editor really has, copied so the phone
// offers the same ones (lib/editor/types.ts, lib/editor/ai-text.ts,
// app/dashboard/editor/components/panels/text/textPresets.ts). Pinned by
// lib/mobile-editor-schema.test.ts — it fails if the web list changes.

export type Option<T extends string = string> = { id: T; label: string };

// The preset shapes (ASPECT_DIMENSIONS' keys). "original" is not offered as
// a pick on the phone: it takes the source's shape, set on the web.
export const EDITOR_ASPECTS = ["9:16", "1:1", "16:9", "4:5"] as const;
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
export function exportResolution(aspect: TimelineDoc["aspect"], free: boolean, frame?: { w: number; h: number }): string {
  const long = free ? 1280 : 1920;
  const short = free ? 720 : 1080;
  const even = (n: number) => Math.round(n / 2) * 2;
  if (aspect === "original" && frame) {
    const s = free ? 1280 / Math.max(frame.w, frame.h) : 1;
    return `${even(frame.w * s)}×${even(frame.h * s)}`;
  }
  if (aspect === "4:5") return `${short}×${even((short * 5) / 4)}`;
  return aspect === "16:9" ? `${long}×${short}` : aspect === "1:1" ? `${short}×${short}` : `${short}×${long}`;
}

// ── Mobile API: the editor (/api/mobile/v1/projects/:id/editor, /editor/projects) ──
// The app edits the web editor's own timeline document (decision 2026-10-09
// A), so a draft opens on either. Every doc that crosses the wire is checked
// with the same validateDoc the server's renderer uses.

/** A timeline document that passes validateDoc. */
export const timelineDocSchema = z.custom<TimelineDoc>((d) => validateDoc(d) === null, { message: "That edit can’t be saved: the timeline isn’t valid." });

/** GET /projects/:id/editor — the doc, its save version, and a playable link for every file it uses. */
export const editorOpenResponse = z.object({
  projectId: z.string(),
  title: z.string(),
  /** Send back as expectedVersion; a save from elsewhere bumps it. */
  version: z.number().int(),
  doc: timelineDocSchema,
  /** assetId → the file (signed url, length, thumbnail). Missing = deleted or not the caller's. */
  media: z.record(z.string(), assetSchema),
});
export type EditorOpen = z.infer<typeof editorOpenResponse>;

/** PUT /projects/:id/editor → { version }, or 409 { code: "version_conflict", currentVersion }. */
export const editorSaveRequest = z.object({ doc: timelineDocSchema, expectedVersion: z.number().int() });
export const editorSaveResponse = z.object({ version: z.number().int() });

/** POST /editor/projects — start an edit from a clip, a file in Assets, or nothing. */
export const editorCreateRequest = z.discriminatedUnion("from", [
  z.object({ from: z.literal("clip"), clipId: z.string().min(1) }),
  z.object({ from: z.literal("asset"), assetId: z.string().min(1) }),
  z.object({ from: z.literal("blank"), aspect: z.enum(EDITOR_ASPECTS).default("9:16"), title: z.string().trim().min(1).max(200).optional() }),
]);
export type EditorCreateRequest = z.input<typeof editorCreateRequest>;
export const editorCreateResponse = z.object({ projectId: z.string() });

// ── Mobile API: editor tools (Phase 9.2) ────────────────────────────────

/** POST /editor/captions — transcribes one video from the caller's Assets (Clip Minutes: 1 per started minute of the whole file). */
export const captionsRequest = z.object({ assetId: z.string().min(1), languageCode: z.string().trim().max(10).optional() });
/** Word timings in source-time milliseconds; the app turns them into caption cues (wordsToCaptionCues). */
export const captionsResponse = z.object({
  words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })),
  minutesCharged: z.number().nonnegative(),
  minutesRemaining: z.number(),
});
export type CaptionsResponse = z.infer<typeof captionsResponse>;

/** The editor's text operations (lib/editor/ai-text.ts): seven AI, three instant. */
export const AI_TEXT_OPERATION_IDS = ["rewrite", "grammar", "readability", "shorten", "expand", "viral", "translate", "emojis", "lineBreaks", "fillerWords"] as const;
export type AiTextOperationId = (typeof AI_TEXT_OPERATION_IDS)[number];
export const AI_TEXT_MAX_CHARS = 4000;
/**
 * POST /editor/ai-text — one or several texts (several = every caption at
 * once, one line each, in a single AI call). The same number come back.
 */
export const aiTextRequest = z.object({
  operation: z.enum(AI_TEXT_OPERATION_IDS),
  texts: z.array(z.string().max(AI_TEXT_MAX_CHARS)).min(1).max(300),
  targetLang: z.string().trim().max(40).optional(),
});
export const aiTextResponse = z.object({ texts: z.array(z.string()) });

/**
 * GET /editor/stock?type=&q=&page= — stock videos, images and music through
 * the server (keys stay there). GIFs aren't offered: the import can't keep
 * them animated.
 */
export const STOCK_TYPES = ["video", "image", "audio"] as const;
export const stockItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  thumbUrl: z.string(),
  downloadUrl: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
  durationSec: z.number().optional(),
  attribution: z.string(),
});
export type StockItem = z.infer<typeof stockItemSchema>;
export const stockSearchResponse = z.object({ items: z.array(stockItemSchema) });
/** POST /editor/stock/import — copies a search result into the caller's Assets. */
export const stockImportRequest = z.object({
  type: z.enum(STOCK_TYPES),
  item: stockItemSchema,
});

/** GET /voices — the voices a voiceover can use (the web's /api/voices). */
export const editorVoiceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  gender: z.string(),
  accent: z.string().nullable(),
  previewUrl: z.string().nullable(),
  /** Bills at this multiple of the usual per-character rate. */
  creditMultiplier: z.number(),
});
export type EditorVoice = z.infer<typeof editorVoiceSchema>;
export const voicesResponse = z.object({ configured: z.boolean(), voices: z.array(editorVoiceSchema) });
