import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";
import { TOOL_COSTS, IMAGE_GENERATOR_STARTING_CREDIT_COST, VIDEO_GENERATOR_STARTING_CREDIT_COST } from "@/lib/tool-costs";

const CACHE_KEY = "admin:tool_config";
const CACHE_TTL = 60; // seconds

export interface ToolConfig {
  enabled: boolean;
  creditCost: number;
}

export type ToolConfigMap = Record<string, ToolConfig>;

// Defaults for every tool. These are used when no DB config row exists yet.
// creditCost is a straight re-export of lib/tool-costs.ts's TOOL_COSTS — this
// used to be a second, hand-copied number here that could (and did) drift
// from the cost-rationale comments living in each route; now there's one
// source of truth.
//
// image-generator / video-generator: creditCost here is display-only — it
// feeds the public "starting at N credits" price (app/api/tool-costs/route.ts)
// and the admin pricing editor. Actual per-generation deduction is read from
// the selected model's own cost in lib/models/imageModels.ts / videoModels.ts
// (see app/api/tools/image-generator/route.ts and
// app/api/tools/video-generator/route.ts) — these two constants are computed
// from those registries, not hand-kept-in-sync.
export const TOOL_DEFAULTS: ToolConfigMap = {
  "audio-balancer":   { enabled: true, creditCost: TOOL_COSTS["audio-balancer"].creditCost },
  "mp3-converter":    { enabled: true, creditCost: TOOL_COSTS["mp3-converter"].creditCost },
  "video-compressor": { enabled: true, creditCost: TOOL_COSTS["video-compressor"].creditCost },
  "enhance-prompt":   { enabled: true, creditCost: TOOL_COSTS["enhance-prompt"].creditCost },
  "brainstormer":     { enabled: true, creditCost: TOOL_COSTS["brainstormer"].creditCost },
  "social-insights":  { enabled: true, creditCost: TOOL_COSTS["social-insights"].creditCost },
  "social-exec-report":    { enabled: true, creditCost: TOOL_COSTS["social-exec-report"].creditCost },
  "social-content-recs":   { enabled: true, creditCost: TOOL_COSTS["social-content-recs"].creditCost },
  "social-caption":        { enabled: true, creditCost: TOOL_COSTS["social-caption"].creditCost },
  "social-post-narration": { enabled: true, creditCost: TOOL_COSTS["social-post-narration"].creditCost },
  "social-kpi-explain":    { enabled: true, creditCost: TOOL_COSTS["social-kpi-explain"].creditCost },
  "cut-and-crop":     { enabled: true, creditCost: TOOL_COSTS["cut-and-crop"].creditCost },
  "subtitle-remover": { enabled: true, creditCost: TOOL_COSTS["subtitle-remover"].creditCost },
  "image-generator":  { enabled: true, creditCost: IMAGE_GENERATOR_STARTING_CREDIT_COST },
  "voiceover":        { enabled: true, creditCost: TOOL_COSTS["voiceover"].creditCost },
  "vocal-remover":    { enabled: true, creditCost: TOOL_COSTS["vocal-remover"].creditCost },
  "ai-creator":       { enabled: true, creditCost: TOOL_COSTS["ai-creator"].creditCost },
  "voice-changer":    { enabled: true, creditCost: TOOL_COSTS["voice-changer"].creditCost },
  "reddit-video":     { enabled: true, creditCost: TOOL_COSTS["reddit-video"].creditCost },
  "text-video":       { enabled: true, creditCost: TOOL_COSTS["text-video"].creditCost },
  "enhance-speech":   { enabled: true, creditCost: TOOL_COSTS["enhance-speech"].creditCost },
  "video-generator":      { enabled: true, creditCost: VIDEO_GENERATOR_STARTING_CREDIT_COST },
  "youtube-downloader":     { enabled: true, creditCost: TOOL_COSTS["youtube-downloader"].creditCost },
  "instagram-downloader":   { enabled: true, creditCost: TOOL_COSTS["instagram-downloader"].creditCost },
  "background-remover":     { enabled: true, creditCost: TOOL_COSTS["background-remover"].creditCost },
  "face-swap":              { enabled: true, creditCost: TOOL_COSTS["face-swap"].creditCost },
  // AutoClip bills through getAutoClipPricing, not this map — these two entries
  // exist so the feature has a published price and an admin enable/disable
  // switch like every other tool. creditCost is display-only for both.
  "auto-clip":              { enabled: true, creditCost: TOOL_COSTS["auto-clip"].creditCost },
  "clip-dub":               { enabled: true, creditCost: TOOL_COSTS["clip-dub"].creditCost },
};

export const TOOL_SERVICE: Record<string, string> = {
  "audio-balancer":   "FFmpeg (local)",
  "mp3-converter":    "FFmpeg (local)",
  "video-compressor": "FFmpeg (local)",
  "enhance-prompt":   "Google Gemini",
  "brainstormer":     "Google Gemini",
  "social-insights":  "Google Gemini",
  "social-exec-report":    "Google Gemini",
  "social-content-recs":   "Google Gemini",
  "social-caption":        "Google Gemini",
  "social-post-narration": "Google Gemini",
  "social-kpi-explain":    "Google Gemini",
  "cut-and-crop":     "FFmpeg (local)",
  "subtitle-remover": "FFmpeg (local)",
  "image-generator":  "9 models — Gemini, Seedream, Flux, GPT Image…",
  "voiceover":        "ElevenLabs TTS",
  "vocal-remover":    "fal.ai Demucs",
  "ai-creator":       "fal.ai SadTalker",
  "voice-changer":    "ElevenLabs STS",
  "reddit-video":     "ElevenLabs + FFmpeg",
  "text-video":       "ElevenLabs + FFmpeg",
  "enhance-speech":   "ElevenLabs Isolation",
  "video-generator":     "8 models — Veo 3, Seedance, Wan, LTX…",
  "youtube-downloader":    "yt-dlp (YouTube)",
  "instagram-downloader":  "yt-dlp (Instagram)",
  "background-remover":    "fal.ai rembg",
  "face-swap":             "fal.ai face-swap",
  "auto-clip":             "Whisper/ElevenLabs + Gemini + GPU render",
  "clip-dub":              "ElevenLabs Dubbing",
};

async function loadFromDB(): Promise<ToolConfigMap> {
  const row = await prisma.config.findUnique({ where: { key: "tool_config" } });
  if (!row) return { ...TOOL_DEFAULTS };
  try {
    const parsed = JSON.parse(row.value) as Partial<ToolConfigMap>;
    // Merge with defaults so new tools get their default values automatically
    const merged: ToolConfigMap = { ...TOOL_DEFAULTS };
    for (const [slug, cfg] of Object.entries(parsed)) {
      if (cfg) merged[slug] = cfg;
    }
    return merged;
  } catch {
    return { ...TOOL_DEFAULTS };
  }
}

export async function getAllToolConfigs(): Promise<ToolConfigMap> {
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as ToolConfigMap;
    } catch {
      // fall through to DB
    }
  }
  const cfg = await loadFromDB();
  await redis.set(CACHE_KEY, JSON.stringify(cfg), "EX", CACHE_TTL);
  return cfg;
}

export async function getToolConfig(slug: string): Promise<ToolConfig> {
  const all = await getAllToolConfigs();
  return all[slug] ?? TOOL_DEFAULTS[slug] ?? { enabled: true, creditCost: 0 };
}

export async function setToolConfig(slug: string, patch: Partial<ToolConfig>): Promise<void> {
  const all = await loadFromDB();
  all[slug] = { ...(all[slug] ?? TOOL_DEFAULTS[slug] ?? { enabled: true, creditCost: 0 }), ...patch };
  await prisma.config.upsert({
    where: { key: "tool_config" },
    update: { value: JSON.stringify(all) },
    create: { key: "tool_config", value: JSON.stringify(all) },
  });
  // Bust the cache immediately
  await redis.del(CACHE_KEY);
}

// Helper for audit logging — never throws (audit failures must not block
// operations). Kept for existing call sites; delegates to the canonical
// lib/admin/audit.ts helper so there is one audit-writing code path.
export async function writeAuditLog(params: {
  adminId: string;
  action: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}) {
  const { auditAdminAction } = await import("@/lib/admin/audit");
  await auditAdminAction(params.adminId, params.action, params.targetId, {
    before: params.before ?? undefined,
    after: params.after ?? undefined,
  });
}
