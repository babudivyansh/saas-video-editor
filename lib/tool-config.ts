import { redis } from "@/lib/redis";
import { prisma } from "@/lib/prisma";

const CACHE_KEY = "admin:tool_config";
const CACHE_TTL = 60; // seconds

export interface ToolConfig {
  enabled: boolean;
  creditCost: number;
}

export type ToolConfigMap = Record<string, ToolConfig>;

// Defaults for every tool. These are used when no DB config row exists yet.
export const TOOL_DEFAULTS: ToolConfigMap = {
  "audio-balancer":   { enabled: true, creditCost: 0 },
  "mp3-converter":    { enabled: true, creditCost: 0 },
  "video-compressor": { enabled: true, creditCost: 0 },
  "enhance-prompt":   { enabled: true, creditCost: 0 },
  "brainstormer":     { enabled: true, creditCost: 1 },
  "cut-and-crop":     { enabled: true, creditCost: 1 },
  "subtitle-remover": { enabled: true, creditCost: 1 },
  "image-generator":  { enabled: true, creditCost: 1 },
  "voiceover":        { enabled: true, creditCost: 1 },
  "vocal-remover":    { enabled: true, creditCost: 2 },
  "ai-creator":       { enabled: true, creditCost: 2 },
  "voice-changer":    { enabled: true, creditCost: 2 },
  "reddit-video":     { enabled: true, creditCost: 2 },
  "text-video":       { enabled: true, creditCost: 2 },
  "enhance-speech":   { enabled: true, creditCost: 3 },
  "video-generator":      { enabled: true, creditCost: 20 },
  "youtube-downloader":     { enabled: true, creditCost: 0 },
  "background-remover":     { enabled: true, creditCost: 1 },
  "face-swap":              { enabled: true, creditCost: 2 },
};

export const TOOL_SERVICE: Record<string, string> = {
  "audio-balancer":   "FFmpeg (local)",
  "mp3-converter":    "FFmpeg (local)",
  "video-compressor": "FFmpeg (local)",
  "enhance-prompt":   "Google Gemini",
  "brainstormer":     "Google Gemini",
  "cut-and-crop":     "FFmpeg (local)",
  "subtitle-remover": "FFmpeg (local)",
  "image-generator":  "Google Gemini (Imagen)",
  "voiceover":        "ElevenLabs TTS",
  "vocal-remover":    "fal.ai Demucs",
  "ai-creator":       "fal.ai SadTalker",
  "voice-changer":    "ElevenLabs STS",
  "reddit-video":     "ElevenLabs + FFmpeg",
  "text-video":       "ElevenLabs + FFmpeg",
  "enhance-speech":   "ElevenLabs Isolation",
  "video-generator":     "fal.ai Veo3",
  "youtube-downloader":    "yt-dlp (YouTube)",
  "background-remover":    "fal.ai rembg",
  "face-swap":             "fal.ai face-swap",
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

// Helper for audit logging — never throws (audit failures must not block operations)
export async function writeAuditLog(params: {
  adminId: string;
  action: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        adminId: params.adminId,
        action: params.action,
        targetId: params.targetId ?? null,
        before: params.before != null ? JSON.stringify(params.before) : null,
        after: params.after != null ? JSON.stringify(params.after) : null,
      },
    });
  } catch {
    // Silently swallow — audit must never block the actual operation
  }
}
