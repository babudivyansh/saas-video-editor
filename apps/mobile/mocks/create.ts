import {
  IMAGE_MODEL_CATALOG,
  autoClipMinutes,
  autoClipStartRequest,
  imageGenerateRequest,
  voiceoverRequest,
  type AutoClipStartRequest,
  type CaptionTemplate,
  type GeneratedMedia,
  type ImageGenerateRequest,
  type ImageModel,
  type PlanTier,
  type Voice,
  type VoiceoverRequest,
} from "@clipiro/shared";
import { ApiError, respond, wait } from "./core";

// Stand-in for the Create tab's API until Phase 5 (AutoClip start, caption
// templates, image models, voices, AI results). Catalogue values are the web
// app's — lib/mobile-create-schema.test.ts checks them against lib/.
// Scenarios (core.ts): "create" (account context), "results", "autoclip-start",
// "generate".

export type CreateContext = {
  plan: PlanTier;
  clipMinutes: number;
  aiCredits: number;
  /** Videos in Assets that AutoClip can start from. */
  videoAssets: { id: string; title: string; durationSec: number; thumbnailUrl: string }[];
};

const STUDIO: CreateContext = {
  plan: "studio",
  clipMinutes: 1000,
  aiCredits: 1171,
  videoAssets: [
    { id: "ast_1", title: "Founders Pod · Ep. 42", durationSec: 58 * 60 + 12, thumbnailUrl: "asset:studio-mic" },
    { id: "ast_2", title: "Gym vlog · Leg day", durationSec: 14 * 60 + 40, thumbnailUrl: "asset:gym-lift" },
    { id: "ast_3", title: "Keynote rehearsal", durationSec: 42 * 60, thumbnailUrl: "asset:keynote-stage" },
    { id: "ast_4", title: "Summit trip", durationSec: 9 * 60 + 5, thumbnailUrl: "asset:travel-summit" },
    { id: "ast_5", title: "Studio Q&A", durationSec: 31 * 60, thumbnailUrl: "asset:podcast-mic" },
    { id: "ast_6", title: "DJ set teaser", durationSec: 6 * 60 + 30, thumbnailUrl: "asset:dj-neon" },
    { id: "ast_7", title: "Behind the scenes", durationSec: 12 * 60, thumbnailUrl: "asset:clapper" },
    { id: "ast_8", title: "Interview · Maya", durationSec: 26 * 60, thumbnailUrl: "asset:creator-golden" },
  ],
};
const NEW_FREE: CreateContext = { plan: "free", clipMinutes: 30, aiCredits: 10, videoAssets: [] };

export async function getCreateContext(): Promise<CreateContext> {
  const s = await respond("create");
  return s === "empty" ? NEW_FREE : STUDIO;
}

// lib/caption-templates.ts: the native (free) styles and the verified premium ones.
export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  { id: "clean", name: "Clean", category: "minimal", premium: false, look: { highlight: null, uppercase: false } },
  { id: "hormozi", name: "Bold Impact", category: "viral", premium: false, look: { highlight: "emerald", uppercase: true } },
  { id: "podcast", name: "Podcast", category: "podcast", premium: false, look: { highlight: "warning", uppercase: false } },
  { id: "minimal", name: "Minimal", category: "minimal", premium: false, look: { highlight: null, uppercase: false } },
  { id: "neon", name: "Neon", category: "creator", premium: false, look: { highlight: "info", uppercase: true } },
  { id: "news", name: "Headline", category: "professional", premium: false, look: { highlight: "error", uppercase: true } },
  { id: "viral-bold-01", name: "Hormozi 1", category: "viral", premium: true, look: { highlight: "warning", uppercase: true } },
  { id: "viral-bold-02", name: "Hormozi 2", category: "viral", premium: true, look: { highlight: "emerald", uppercase: true } },
  { id: "viral-punch", name: "Hormozi 3", category: "viral", premium: true, look: { highlight: "error", uppercase: true } },
  { id: "viral-beast", name: "Beast", category: "viral", premium: true, look: { highlight: "warning", uppercase: true } },
  { id: "creator-modern", name: "Ali", category: "creator", premium: true, look: { highlight: "info", uppercase: false } },
  { id: "creator-pop", name: "Maya", category: "creator", premium: true, look: { highlight: "emerald", uppercase: false } },
  { id: "podcast-bold", name: "Carlos", category: "podcast", premium: true, look: { highlight: "warning", uppercase: true } },
  { id: "clean-minimal", name: "Sara", category: "minimal", premium: true, look: { highlight: null, uppercase: false } },
  { id: "professional-01", name: "David", category: "professional", premium: true, look: { highlight: "info", uppercase: false } },
];

export async function getCaptionTemplates(): Promise<CaptionTemplate[]> {
  await wait();
  return CAPTION_TEMPLATES;
}

export const IMAGE_MODELS = IMAGE_MODEL_CATALOG;

export async function getImageModels(): Promise<ImageModel[]> {
  await wait();
  return IMAGE_MODELS;
}

// Active voices from lib/voices/catalog.ts (retired slugs like "william" left out).
export const VOICES: Voice[] = [
  { id: "brian", name: "Brian", description: "Deep, Resonant and Comforting" },
  { id: "george", name: "George", description: "Warm, Captivating Storyteller" },
  { id: "sarah", name: "Sarah", description: "Mature, Reassuring, Confident" },
  { id: "liam", name: "Liam", description: "Energetic, Social Media Creator" },
  { id: "alice", name: "Alice", description: "Clear, Engaging Educator" },
  { id: "jessica", name: "Jessica", description: "Playful, Bright, Warm" },
  { id: "daniel", name: "Daniel", description: "Steady Broadcaster" },
  { id: "river", name: "River", description: "Relaxed, Neutral, Informative" },
];

export async function getVoices(): Promise<Voice[]> {
  await wait();
  return VOICES;
}

let results: GeneratedMedia[] = [
  { id: "gen_1", kind: "image", url: "asset:travel-summit", title: "A photographer on a misty mountain summit at sunrise", createdAt: "2026-10-01T18:20:00+05:30", favorite: false, assetId: "ast_ai_1" },
  { id: "gen_2", kind: "image", url: "asset:dj-neon", title: "Neon DJ decks, close-up, purple haze", createdAt: "2026-10-01T18:05:00+05:30", favorite: false, assetId: "ast_ai_2" },
];

export async function getRecentResults(kind: GeneratedMedia["kind"]): Promise<GeneratedMedia[]> {
  const s = await respond("results");
  return s === "empty" ? [] : results.filter((r) => r.kind === kind);
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  await wait();
  results = results.map((r) => (r.id === id ? { ...r, favorite } : r));
}

/** The web's free "Enhance prompt" (Gemini rewrite; 20 an hour). */
export async function enhancePrompt(prompt: string): Promise<string> {
  await respond("enhance");
  const base = prompt.trim().replace(/[.\s]+$/, "");
  return `${base}, dramatic natural light, rich detail, shallow depth of field, high resolution`;
}

let seq = 0;
export async function generateImage(input: ImageGenerateRequest, ctx: { plan: PlanTier; aiCredits: number }): Promise<GeneratedMedia> {
  const req = imageGenerateRequest.parse(input);
  await respond("generate");
  const model = IMAGE_MODELS.find((m) => m.id === req.modelId);
  if (!model) throw new ApiError("That model isn't available.", 400);
  if (ctx.aiCredits < model.credits) throw new ApiError("Not enough AI credits.", 402);
  const item: GeneratedMedia = {
    id: `gen_new_${++seq}`,
    kind: "image",
    url: "asset:travel-summit",
    title: req.prompt,
    createdAt: new Date().toISOString(),
    favorite: false,
    assetId: `ast_ai_new_${seq}`,
  };
  results = [item, ...results];
  return item;
}

export async function generateVoiceover(input: VoiceoverRequest): Promise<GeneratedMedia> {
  const req = voiceoverRequest.parse(input);
  await respond("generate");
  const item: GeneratedMedia = {
    id: `gen_vo_${++seq}`,
    kind: "audio",
    url: "mock://voiceover.mp3",
    title: req.text.slice(0, 60),
    createdAt: new Date().toISOString(),
    favorite: false,
    assetId: `ast_ai_vo_${seq}`,
  };
  results = [item, ...results];
  return item;
}

/** Enhance speech / vocal remover: returns the processed track. */
export async function runAudioTool(tool: "enhance" | "vocal", fileName: string): Promise<GeneratedMedia> {
  await respond("generate");
  const item: GeneratedMedia = {
    id: `gen_${tool}_${++seq}`,
    kind: "audio",
    url: "mock://processed.mp3",
    title: `${tool === "enhance" ? "enhanced" : "instrumental"}-${fileName.replace(/\.[^.]+$/, "")}.mp3`,
    createdAt: new Date().toISOString(),
    favorite: false,
    assetId: `ast_ai_${tool}_${seq}`,
  };
  results = [item, ...results];
  return item;
}

export async function startAutoClip(input: AutoClipStartRequest, ctx: { clipMinutes: number }): Promise<{ projectId: string; minutesCharged: number }> {
  const { source } = autoClipStartRequest.parse(input);
  await respond("autoclip-start");
  // Uploads aren't probed until Phase 7; assume the median podcast length.
  const sec = source.durationSec ?? 59 * 60;
  const minutes = autoClipMinutes(sec);
  if (minutes > ctx.clipMinutes) throw new ApiError(`This video needs ${minutes} Clip Minutes; you have ${ctx.clipMinutes}.`, 402);
  return { projectId: "prj_founders_42", minutesCharged: minutes };
}

/** Reads a link's title and length before the job starts (the web's yt-dlp probe). */
export async function probeLink(url: string): Promise<{ title: string; durationSec: number }> {
  await respond("probe");
  if (/live/i.test(url)) throw new ApiError("Live streams can't be clipped. Try again when it has ended.", 422);
  return { title: "Founders Pod · Ep. 42", durationSec: 59 * 60 };
}
