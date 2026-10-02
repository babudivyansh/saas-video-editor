import { z } from "zod";

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
  }),
  z.object({ kind: z.literal("link"), url: sourceLinkSchema, title: z.string().nullable(), durationSec: z.number().positive().nullable() }),
  z.object({ kind: z.literal("asset"), assetId: z.string(), title: z.string(), durationSec: z.number().positive() }),
]);
export type AutoClipSource = z.infer<typeof autoClipSourceSchema>;

/** Why a picked file can't be used on this plan, or null. */
export function uploadProblem(file: { sizeBytes: number; mimeType: string }, plan: PlanTier): string | null {
  if (!(AUTOCLIP_FILE_TYPES as readonly string[]).includes(file.mimeType)) return "Use an MP4, MOV or WebM video";
  const { maxBytes } = AUTOCLIP_LIMITS[plan];
  if (file.sizeBytes > maxBytes) return `That file is over your ${PLAN_LABEL[plan]} plan's ${formatBytes(maxBytes)} limit`;
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
  /** null = captions off. */
  captionTemplateId: z.string().nullable().default("clean"),
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

export const captionTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(["viral", "creator", "podcast", "minimal", "professional", "more"]),
  /** Premium (Submagic) styles render for extra AI credits. */
  premium: z.boolean(),
  /** How the preview draws the highlighted word. */
  look: z.object({ highlight: z.string().nullable(), uppercase: z.boolean() }),
});
export type CaptionTemplate = z.infer<typeof captionTemplateSchema>;

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
export function audioToolCredits(tool: AudioToolId, sec: number): number {
  const t = AUDIO_TOOLS[tool];
  return Math.max(1, Math.ceil((sec / t.perSec) * t.creditsPer));
}
