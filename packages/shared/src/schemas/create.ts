import { z } from "zod";
import { CAPTION_TEMPLATES, DEFAULT_CAPTION_TEMPLATE_ID } from "../captions/templates";

// Create tab: AutoClip and AI Media. Values mirror the web app so the phone
// and clipiro.com agree on what's allowed and what it costs:
//   lib/autoclip-create-input.ts, lib/url-import.ts, lib/plans/tiers.ts,
//   lib/autoclip-pricing.ts, lib/models/imageModels.ts, lib/audio-pricing.ts.

// ── Plans ─────────────────────────────────────────────────────────────────
export const planTierSchema = z.enum(["free", "creator", "pro", "studio"]);
export type PlanTier = z.infer<typeof planTierSchema>;
export const PLAN_ORDER: readonly PlanTier[] = ["free", "creator", "pro", "studio"];
export const PLAN_LABEL: Record<PlanTier, string> = { free: "Free", creator: "Creator", pro: "Pro", studio: "Studio" };
export const planAtLeast = (plan: PlanTier, min: PlanTier) => PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(min);

const MB = 1024 * 1024;
/** AutoClip source limits per plan (tiers.ts MAX_UPLOAD_BYTES_BY_TIER + source length cap). */
export const AUTOCLIP_LIMITS: Record<PlanTier, { maxBytes: number; maxSourceSec: number }> = {
  free: { maxBytes: 250 * MB, maxSourceSec: 30 * 60 },
  creator: { maxBytes: 1024 * MB, maxSourceSec: 2 * 3600 },
  pro: { maxBytes: 2048 * MB, maxSourceSec: 4 * 3600 },
  studio: { maxBytes: 5120 * MB, maxSourceSec: 6 * 3600 },
};
export const AUTOCLIP_FILE_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

// ── Sources ───────────────────────────────────────────────────────────────
/** url-import.ts allowlist: https only, exact host match. */
export const SOURCE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "vimeo.com",
  "player.vimeo.com",
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "www.dropbox.com",
  "loom.com",
  "www.loom.com",
] as const;

export function isAllowedSourceUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" && (SOURCE_HOSTS as readonly string[]).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const sourceLinkSchema = z
  .string()
  .trim()
  .min(1, "Paste a link")
  .refine(isAllowedSourceUrl, "Use a YouTube, Vimeo, Loom, Google Drive or Dropbox link");

export const autoClipSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("upload"),
    fileName: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    mimeType: z.enum(AUTOCLIP_FILE_TYPES),
    /** Known once the file is probed; null until then. */
    durationSec: z.number().positive().nullable(),
    /** Where the file is on the phone (file:// in the app cache). */
    uri: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal("link"), url: sourceLinkSchema, title: z.string().nullable(), durationSec: z.number().positive().nullable() }),
  z.object({ kind: z.literal("asset"), assetId: z.string(), title: z.string(), durationSec: z.number().positive() }),
]);
export type AutoClipSource = z.infer<typeof autoClipSourceSchema>;

/** Why a picked file can't be used on this plan, or null. */
export function uploadProblem(file: { sizeBytes: number; mimeType: string; durationSec?: number | null }, plan: PlanTier): string | null {
  if (!(AUTOCLIP_FILE_TYPES as readonly string[]).includes(file.mimeType)) return "Use an MP4, MOV or WebM video";
  const { maxBytes, maxSourceSec } = AUTOCLIP_LIMITS[plan];
  if (file.sizeBytes > maxBytes) return `That file is over your ${PLAN_LABEL[plan]} plan's ${formatBytes(maxBytes)} limit`;
  if (file.durationSec != null && file.durationSec > maxSourceSec) return `That video is over your ${PLAN_LABEL[plan]} plan's ${formatHours(maxSourceSec)} limit`;
  return null;
}

export function formatBytes(n: number): string {
  if (n >= 1024 * MB) return `${+(n / (1024 * MB)).toFixed(1)} GB`;
  if (n >= 10 * MB) return `${Math.round(n / MB)} MB`;
  if (n >= MB) return `${+(n / MB).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatHours(sec: number): string {
  return sec >= 3600 ? `${+(sec / 3600).toFixed(1)} h` : `${Math.round(sec / 60)} min`;
}

// ── AutoClip settings ─────────────────────────────────────────────────────
export const CLIP_LENGTHS = [
  { id: "short", label: "<30s", min: 5, max: 30 },
  { id: "standard", label: "15–60s", min: 15, max: 60 },
  { id: "long", label: "60s+", min: 60, max: 120 },
] as const;
export const clipLengthSchema = z.enum(["short", "standard", "long"]);
export const aspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);
export type AspectRatio = z.infer<typeof aspectRatioSchema>;
export const MAX_CLIPS_PER_RUN = 20;
export const MAX_INSTRUCTIONS_CHARS = 500;

export const autoClipSettingsSchema = z.object({
  clipLength: clipLengthSchema.default("standard"),
  clipCount: z.number().int().min(1).max(MAX_CLIPS_PER_RUN).default(8),
  aspectRatio: aspectRatioSchema.default("9:16"),
  /** null = captions off. Retired ids still validate; the server maps them to their replacement. */
  captionTemplateId: z.string().nullable().default(DEFAULT_CAPTION_TEMPLATE_ID),
  smartAutoReframe: z.boolean().default(true),
  reframingPreset: z.enum(["balanced", "minimal", "dynamic", "cinematic"]).default("balanced"),
  zoomStrength: z.enum(["low", "medium", "high"]).default("medium"),
  speakerMode: z.enum(["auto", "single", "split", "active"]).default("auto"),
  smoothness: z.number().int().min(0).max(100).default(50),
  trackingSpeed: z.number().int().min(0).max(100).default(50),
  removeSilence: z.boolean().default(false),
  silenceThresholdMs: z.number().int().min(200).max(1000).default(400),
  removeFillers: z.boolean().default(false),
  instructions: z.string().max(MAX_INSTRUCTIONS_CHARS).default(""),
});
export type AutoClipSettings = z.infer<typeof autoClipSettingsSchema>;
export const DEFAULT_AUTOCLIP_SETTINGS: AutoClipSettings = autoClipSettingsSchema.parse({});

export const autoClipStartRequest = z.object({ source: autoClipSourceSchema, settings: autoClipSettingsSchema });
export type AutoClipStartRequest = z.infer<typeof autoClipStartRequest>;
export const autoClipStartResponse = z.object({ projectId: z.string(), minutesCharged: z.number().int().nonnegative() });

/** 1 Clip Minute per started minute of source, at least 1 (autoclip-pricing.ts). */
export const autoClipMinutes = (sourceSec: number) => Math.max(1, Math.ceil(sourceSec / 60));

/** lib/plans/tiers.ts: a Clip Minutes shortfall can be paid in AI credits, 3 minutes per credit. */
export const OVERFLOW_MINUTES_PER_CREDIT = 3;
export const overflowCreditsFor = (minutesShort: number) => (minutesShort > 0 ? Math.ceil(minutesShort / OVERFLOW_MINUTES_PER_CREDIT) : 0);

export const captionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.enum(["viral", "karaoke", "box", "creator", "podcast", "minimal", "cinema", "retro", "desi"]),
  /** The plan the template needs; the server refuses runs and saves below it. */
  tier: z.enum(["free", "creator", "pro"]),
  /** What the app's static swatch draws. Colours are #rrggbb; highlight is null when the spoken word keeps the base colour. */
  look: z.object({ highlight: z.string().nullable(), base: z.string(), uppercase: z.boolean(), boxed: z.boolean() }),
});
export type CaptionTemplate = z.infer<typeof captionTemplateSchema>;

/**
 * The caption templates, derived from the shared library
 * (src/captions/templates.ts) so the app can never drift from what the server
 * renders. The app can't run the animated preview, so each template carries
 * a static swatch hint.
 */
export const CAPTION_TEMPLATE_CATALOG: CaptionTemplate[] = CAPTION_TEMPLATES.map((t) => {
  const accent = t.colors.accent.slice(0, 7);
  const base = t.colors.base.length === 9 && t.colors.base.endsWith("00") ? "#FFFFFF" : t.colors.base.slice(0, 7);
  return {
    id: t.id,
    name: t.name,
    family: t.family,
    tier: t.tier,
    look: {
      highlight: accent.toUpperCase() === base.toUpperCase() ? null : accent,
      base,
      uppercase: t.type.case === "upper",
      boxed: t.container !== "none" || t.motion === "boxword" || t.motion === "bubble" || t.motion === "blocks",
    },
  };
});

// ── AI Media ──────────────────────────────────────────────────────────────
export const imageRatioSchema = z.enum(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"]);
export type ImageRatio = z.infer<typeof imageRatioSchema>;

export const imageModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  credits: z.number().int().positive(),
  minPlan: planTierSchema,
  ratios: z.array(imageRatioSchema).min(1),
});
export type ImageModel = z.infer<typeof imageModelSchema>;
/**
 * The image models and their prices (lib/models/imageModels.ts; minPlan is the
 * lowest of allowedTiers). The API serves this list; the app keeps a copy as
 * mock data, checked against the web by lib/mobile-create-schema.test.ts.
 */
export const IMAGE_MODEL_CATALOG: ImageModel[] = [
  { id: "gemini-flash-2.0", name: "Gemini 2.5 Flash Image", credits: 2, minPlan: "free", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"] },
  { id: "seedream-5.0", name: "Seedream 5.0", credits: 2, minPlan: "creator", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
  { id: "gpt-image-2", name: "GPT Image 2", credits: 6, minPlan: "pro", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
  { id: "flux-2", name: "Flux 2", credits: 3, minPlan: "creator", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
  { id: "nano-banana-2", name: "Nano Banana 2", credits: 5, minPlan: "pro", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"] },
  { id: "ideogram-4", name: "Ideogram 4", credits: 3, minPlan: "creator", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
  { id: "krea-2", name: "Krea 2", credits: 2, minPlan: "creator", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
  { id: "nano-banana-pro", name: "Nano Banana Pro", credits: 10, minPlan: "studio", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"] },
  { id: "qwen-image-2.0", name: "Qwen Image 2.0", credits: 2, minPlan: "free", ratios: ["1:1", "4:3", "3:4", "16:9", "9:16"] },
];
export const DEFAULT_IMAGE_MODEL_ID = "gemini-flash-2.0";
export const MAX_PROMPT_CHARS = 1000;

export const imageGenerateRequest = z.object({
  prompt: z.string().trim().min(3, "Describe the image").max(MAX_PROMPT_CHARS),
  modelId: z.string(),
  ratio: imageRatioSchema,
});
export type ImageGenerateRequest = z.infer<typeof imageGenerateRequest>;

/** POST /tools/enhance-prompt — the AI Media "Prompt generator" (free, rate-limited). */
export const enhancePromptRequest = z.object({ prompt: z.string().trim().min(3, "Write a few words first, then improve them.").max(MAX_PROMPT_CHARS) });
export const enhancePromptResponse = z.object({ prompt: z.string() });

export const generatedMediaSchema = z.object({
  id: z.string(),
  kind: z.enum(["image", "audio"]),
  url: z.string(),
  title: z.string(),
  createdAt: z.string(),
  favorite: z.boolean(),
  /** Asset it was saved as (AI Assets). */
  assetId: z.string().nullable(),
});
export type GeneratedMedia = z.infer<typeof generatedMediaSchema>;

export const VOICEOVER_MAX_CHARS = 2000;
export const voiceSchema = z.object({ id: z.string(), name: z.string(), description: z.string() });
export type Voice = z.infer<typeof voiceSchema>;
export const voiceoverRequest = z.object({
  text: z.string().trim().min(1, "Write the script").max(VOICEOVER_MAX_CHARS),
  voiceId: z.string(),
});
export type VoiceoverRequest = z.infer<typeof voiceoverRequest>;

/** Upload-based audio tools: limits and price (audio-pricing.ts, upload-policy.ts). */
export const AUDIO_TOOLS = {
  enhance: { name: "Enhance speech", maxBytes: 50 * MB, maxSec: 90, perSec: 60, creditsPer: 8, output: "A clean voice track (MP3)" },
  vocal: { name: "Vocal remover", maxBytes: 50 * MB, maxSec: 300, perSec: 30, creditsPer: 1, output: "The instrumental track (MP3)" },
} as const;
export type AudioToolId = keyof typeof AUDIO_TOOLS;

export const voiceoverCredits = (chars: number) => Math.max(1, Math.ceil(chars / 500));
/**
 * The file-in, file-out AI tools (Phase 10.3): what each takes, its limits on
 * the phone and its plan. Prices are the web routes' own (pinned by
 * lib/mobile-create-schema.test.ts). The server reads a tool's input from
 * Assets into memory, so the phone caps any input at 100 MB (the Subtitle
 * remover takes 500 MB on the web).
 */
export const FILE_TOOLS = {
  "voice-changer": { name: "Voice changer", accepts: "audio", maxBytes: 50 * MB, maxSec: 90, minPlan: "free", output: "Your recording in the new voice (MP3)" },
  "background-remover": { name: "Background remover", accepts: "image", maxBytes: 10 * MB, maxSec: null, minPlan: "free", output: "The image with a see-through background (PNG)" },
  "face-swap": { name: "Face swap", accepts: "image", maxBytes: 10 * MB, maxSec: null, minPlan: "pro", output: "The photo with the new face (JPG)" },
  "subtitle-remover": { name: "Subtitle remover", accepts: "video", maxBytes: 100 * MB, maxSec: null, minPlan: "pro", output: "The video without its burned-in captions (MP4)" },
} as const satisfies Record<string, { name: string; accepts: "audio" | "image" | "video"; maxBytes: number; maxSec: number | null; minPlan: PlanTier; output: string }>;
export type FileToolId = keyof typeof FILE_TOOLS;

/** A file tool's price: the voice changer by the minute (as Enhance speech), the subtitle remover by length, the image tools flat. */
export function fileToolCredits(tool: FileToolId, sec: number): number {
  if (tool === "voice-changer") return audioToolCredits("enhance", sec);
  if (tool === "subtitle-remover") return Math.max(2, Math.min(20, Math.ceil(sec / 10)));
  return tool === "face-swap" ? 2 : 1;
}

export function audioToolCredits(tool: AudioToolId, sec: number): number {
  const t = AUDIO_TOOLS[tool];
  return Math.max(1, Math.ceil((sec / t.perSec) * t.creditsPer));
}
