import { z } from "zod";

// Shapes for the Home tab (dashboard, tools catalogue, AI assistant). The
// mobile app reads these from mocks until Phase 5 adds /api/mobile/v1; the
// API must return exactly these, validated on both sides.

/** A clip as it appears in a strip of thumbnails. */
export const clipThumbSchema = z.object({
  id: z.string(),
  /** Virality score 0–100. */
  score: z.number().int().min(0).max(100),
  durationSec: z.number().int().nonnegative(),
  thumbnailUrl: z.string(),
});
export type ClipThumb = z.infer<typeof clipThumbSchema>;

export const homeSummarySchema = z.object({
  user: z.object({ name: z.string(), avatarUrl: z.string().nullable() }),
  clipMinutes: z.object({ remaining: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
  aiCredits: z.object({ remaining: z.number().int().nonnegative() }),
  clips: z.object({ total: z.number().int().nonnegative(), top: z.array(clipThumbSchema).max(4) }),
  projects: z.object({
    active: z.number().int().nonnegative(),
    rendering: z.number().int().nonnegative(),
    /** 0–100, average progress of the projects that are rendering; null when none are. */
    renderProgress: z.number().min(0).max(100).nullable(),
  }),
  /** Quest XP (lib/quest-config.ts on the web). */
  creator: z.object({ level: z.string(), xp: z.number().int().nonnegative(), nextLevelXp: z.number().int().positive() }),
  unreadNotifications: z.number().int().nonnegative(),
  /** Share of every paid referral, e.g. 20. */
  referralPercent: z.number().int().min(0).max(100),
});
export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const toolCategorySchema = z.enum(["video", "audio", "image"]);
export type ToolCategory = z.infer<typeof toolCategorySchema>;

/** What running a tool costs, as lib/tool-costs.ts prices it. */
export const toolCostSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }),
  z.object({ kind: z.literal("clipMinutes") }),
  z.object({
    kind: z.literal("credits"),
    amount: z.number().int().positive(),
    /** "min" = per minute, "500 chars", "30 s"… null = per run. */
    per: z.string().nullable(),
    /** True when this is the cheapest option ("from 2 credits"). */
    from: z.boolean().default(false),
  }),
]);
export type ToolCost = z.infer<typeof toolCostSchema>;

export const toolSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Short name for the 4-up grid on Home. */
  shortName: z.string(),
  description: z.string(),
  category: toolCategorySchema,
  cost: toolCostSchema,
  /** Plan needed to use it; null = every plan. */
  requiredTier: z.enum(["pro"]).nullable(),
  recommended: z.boolean().default(false),
});
export type Tool = z.infer<typeof toolSchema>;

export const toolsResponseSchema = z.object({ tools: z.array(toolSchema) });

/** One chat turn with Clipiro AI. Rich parts are optional. */
export const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string(),
  createdAt: z.string(),
  clips: z.array(clipThumbSchema).optional(),
  checklist: z.array(z.string()).optional(),
  actions: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantSendRequest = z.object({ text: z.string().trim().min(1, "Type a message").max(2000) });
export type AssistantSendRequest = z.infer<typeof assistantSendRequest>;

/**
 * The tools the app lists, in order, without prices: GET /api/mobile/v1/tools
 * fills `cost` and `requiredTier` from the web's lib/tool-costs.ts and drops
 * tools an admin switched off. `per`: the unit a duration/length-priced tool
 * charges by; `from`: the price is the cheapest option.
 */
export const TOOL_CATALOG: readonly (Omit<Tool, "cost" | "requiredTier"> & { per?: string; from?: boolean })[] = [
  { id: "autoclip", name: "AutoClip", shortName: "AutoClip", description: "Long video in, clips out", category: "video", recommended: false },
  { id: "cut-and-crop", name: "Cut & Crop", shortName: "Cut & Crop", description: "Trim and reframe a video", category: "video", recommended: false },
  { id: "voice-changer", name: "Voice Changer", shortName: "Voice Changer", description: "Swap your voice for another", category: "audio", recommended: false, per: "min" },
  { id: "subtitle-remover", name: "Subtitle Remover", shortName: "Subtitle Remover", description: "Erase burned-in captions", category: "video", recommended: false },
  { id: "face-swap", name: "AI Face Swap", shortName: "AI Face Swap", description: "Swap a face in a photo", category: "image", recommended: false },
  { id: "enhance-speech", name: "AI Speech Enhancer", shortName: "Speech Enhancer", description: "Studio-clean voice from any recording", category: "audio", recommended: false, per: "min" },
  { id: "vocal-remover", name: "AI Vocal Remover", shortName: "Vocal Remover", description: "Split vocals from music", category: "audio", recommended: false, per: "30 s" },
  { id: "background-remover", name: "Background Remover", shortName: "Background Remover", description: "Cut out the subject of a photo", category: "image", recommended: false },
  { id: "image-generator", name: "AI Image Generator", shortName: "Image Generator", description: "Generate images in seconds", category: "image", recommended: true, from: true },
  { id: "voiceover", name: "AI Voiceover", shortName: "Voiceover", description: "Natural narration from your script", category: "audio", recommended: true, per: "500 chars" },
  { id: "brainstormer", name: "AI Brainstormer", shortName: "Brainstormer", description: "Viral ideas for your niche", category: "video", recommended: true },
  { id: "youtube-downloader", name: "YouTube Downloader", shortName: "YouTube Downloader", description: "Save a YouTube video", category: "video", recommended: false },
  { id: "instagram-downloader", name: "Instagram Downloader", shortName: "Instagram Downloader", description: "Save an Instagram Reel", category: "video", recommended: false },
  { id: "video-compressor", name: "Video Compressor", shortName: "Video Compressor", description: "Shrink a video file", category: "video", recommended: false },
  { id: "audio-balancer", name: "Audio Balancer", shortName: "Audio Balancer", description: "Even out loud and quiet parts", category: "audio", recommended: false },
  { id: "mp3-converter", name: "MP3 Converter", shortName: "MP3 Converter", description: "Turn a video into an MP3", category: "audio", recommended: false },
];
