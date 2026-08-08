import { VideoModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/video-generator/route.ts and app/components/VideoGeneratorTool.tsx both
// read this registry generically).
//
// Video models are priced PER SECOND (not flat) — the actually-billed duration
// is clamped to [minDurationSeconds, min(maxDurationSeconds, tier's duration
// cap)] by the route; see lib/plans/tiers.ts's TIER_MAX_DURATION_SECONDS.
// Every model (including Veo3) is gated purely by allowedTiers and billed
// from the one standard credit pool — no per-model special-casing.
// creditsPerSecond = ceil(costUsd(per second) * margin / 0.099), same revenue
// floor as imageModels.ts (Studio Yearly ≈ $0.099/credit), margin 3x standard
// / 4x flagship.
//
// `id` for Veo3 is kept exactly "veo3-fast" to match the value the frontend has always
// initialized its model state to (and always sent, even before the backend honored it).
export const VIDEO_MODELS: readonly VideoModelEntry[] = [
  {
    id: "veo3-fast",
    displayName: "Veo 3",
    provider: "Google",
    badge: "Google",
    category: "video",
    integration: "direct-veo3-fast",
    falEndpoint: "fal-ai/veo3/fast",
    // fal veo3/fast (2026-08 audit): $0.25/s audio-off (base), $0.40/s audio-on.
    costUsd: 0.25, // base = audio-off; audio-on ($0.40/s) is priced via audioCreditsPerSecond
    creditsPerSecond: 8, // audio off: ceil(0.25*3/0.099)
    audioCreditsPerSecond: 13, // audio on: ceil(0.40*3/0.099)
    supportsAudio: true,
    minDurationSeconds: 5,
    maxDurationSeconds: 8, // provider ceiling for the "fast" tier
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "audio", "imageUpload"],
    defaultValues: { duration: "8s", aspectRatio: "16:9", audio: "on" },
    imageInput: "optional",
  },
  {
    id: "seedance-2.0",
    displayName: "Seedance 2.0",
    provider: "ByteDance",
    badge: "ByteDance",
    category: "video",
    integration: "fal",
    // fal bytedance/seedance-2.0 (2026-08 audit): 720p $0.3034/s, 1080p $0.682/s.
    falEndpoint: "bytedance/seedance-2.0/text-to-video",
    costUsd: 0.3034, // $/s at the default 720p
    creditsPerSecond: 10, // 720p: ceil(0.3034*3/0.099)
    resolutionCredits: { "720p": 10, "1080p": 21 }, // 1080p: ceil(0.682*3/0.099)
    minDurationSeconds: 4, // provider floor (4-15s, or "auto")
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "gemini-omni",
    displayName: "Gemini Omni",
    provider: "Google",
    badge: "Google",
    category: "video",
    integration: "fal",
    falEndpoint: "google/gemini-omni-flash",
    // fal google/gemini-omni-flash (2026-08 audit): ~$0.125/s at 720p (token-based).
    costUsd: 0.125,
    creditsPerSecond: 4, // ceil(0.125*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15, // ⚠️ verify: max duration not confirmed on fal
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "grok-imagine-1.5",
    displayName: "Grok Imagine 1.5",
    provider: "xAI",
    badge: "xAI",
    category: "video",
    integration: "fal",
    // fal xai/grok-imagine-video/v1.5 (2026-08 audit): 480p $0.08/s, 720p $0.14/s,
    // 1080p $0.25/s, plus $0.01 per input image (absorbed into the 3x margin).
    falEndpoint: "xai/grok-imagine-video/v1.5/image-to-video",
    costUsd: 0.14, // $/s at the default 720p
    creditsPerSecond: 5, // 720p: ceil(0.14*3/0.099)
    resolutionCredits: { "480p": 3, "720p": 5, "1080p": 8 },
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  // Kling 3.0 is pulled from the registry until its per-second cost and
  // endpoint are verified with the provider (2026-07 pricing audit): a
  // studio-exclusive flagship with an unconfirmed cost is exactly the
  // pre-duration-scaling ai-creator loss-maker pattern. Re-add the entry
  // (studio-only, creditsPerSecond = ceil(costUsd*4/0.099)) once confirmed.
  // Unknown ids fall back to DEFAULT_VIDEO_MODEL_ID in getVideoModel, so any
  // stale client selection degrades safely to Veo 3.
  {
    id: "happyhorse-1.0",
    displayName: "HappyHorse 1.0",
    provider: "Alibaba",
    badge: "Alibaba",
    category: "video",
    integration: "fal",
    falEndpoint: "alibaba/happy-horse/text-to-video",
    // fal alibaba/happy-horse (2026-08 audit): 720p $0.14/s, 1080p $0.28/s.
    costUsd: 0.14, // $/s at the default 720p
    creditsPerSecond: 5, // 720p: ceil(0.14*3/0.099)
    resolutionCredits: { "720p": 5, "1080p": 9 }, // 1080p: ceil(0.28*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15, // ⚠️ verify: max duration not confirmed on fal
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    // id kept as "wan-2.7" so any stored client selection / analytics rows still
    // resolve — only the display name + endpoint move to the real live model.
    id: "wan-2.7",
    displayName: "Wan 2.5",
    provider: "Alibaba",
    badge: "Wan",
    category: "video",
    integration: "fal",
    // fal wan-25-preview (2026-08 audit): 480p $0.05/s, 720p $0.10/s, 1080p $0.15/s.
    falEndpoint: "fal-ai/wan-25-preview/text-to-video",
    costUsd: 0.10, // $/s at the default 720p
    creditsPerSecond: 4, // 720p: ceil(0.10*3/0.099)
    resolutionCredits: { "480p": 2, "720p": 4, "1080p": 5 }, // 480p ceil(0.05*3/0.099), 1080p ceil(0.15*3/0.099)
    minDurationSeconds: 5, // Wan 2.5 supports 5s / 10s
    maxDurationSeconds: 10, // provider ceiling — NOT 15s
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "fps", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p", fps: 24 },
    inputMap: {},
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "ltx-2.3",
    displayName: "LTX 2.3",
    provider: "Lightricks",
    badge: "LTX",
    category: "video",
    integration: "fal",
    // fal fal-ai/ltx-2.3/text-to-video (2026-08 audit): 1080p $0.06/s (cheapest
    // tier). costUsd kept a touch high at $0.08 for safety headroom; 3 cr/s is
    // already ~5x, so no per-resolution table needed.
    falEndpoint: "fal-ai/ltx-2.3/text-to-video",
    costUsd: 0.08, // conservative; real 1080p is $0.06/s
    creditsPerSecond: 3, // ceil(0.08*3/0.099); ~5x at real cost
    minDurationSeconds: 2,
    maxDurationSeconds: 20, // provider supports up to 20s (tier cap trims to <=15)
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p" },
    inputMap: {},
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    // id kept as "pixverse-v6" for selection/analytics stability; display + endpoint
    // move to the confirmed-live v5.6 model.
    id: "pixverse-v6",
    displayName: "PixVerse V5.6",
    provider: "PixVerse",
    badge: "PixVerse",
    category: "video",
    integration: "fal",
    // verify-before-ship: confirm the exact v5.6 slug + $/s on fal. v5.6 is
    // reported ~$0.01/s (5-15s); 3 cr/s is a safe floor (>=3x either way) and the
    // model is creator+ gated, so the unverified cost is mitigated.
    falEndpoint: "fal-ai/pixverse/v5.6/image-to-video",
    costUsd: 0.09, // conservative; reported real is ~$0.01/s
    creditsPerSecond: 3,
    minDurationSeconds: 5, // v5.6 floor is 5s, NOT 2s
    maxDurationSeconds: 15,
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "required",
  },
] as const;

export const DEFAULT_VIDEO_MODEL_ID = "veo3-fast";
export type VideoModelId = typeof VIDEO_MODELS[number]["id"];

export function getVideoModel(id: string | undefined | null): VideoModelEntry {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL_ID)!;
}

/**
 * The effective credits-per-second for a model given the selected resolution and
 * audio flag. Single source of truth shared by the billing route and the
 * generator UI so the credits shown never drift from what's charged.
 *
 * Precedence: audio-on rate (if audio && supported) → per-resolution rate →
 * flat base rate. `overrideCreditsPerSecond` (admin runtime reprice) wins over all.
 */
export function videoCreditsPerSecond(
  model: VideoModelEntry,
  opts?: { resolution?: string; audio?: boolean; overrideCreditsPerSecond?: number },
): number {
  if (opts?.overrideCreditsPerSecond != null) return opts.overrideCreditsPerSecond;
  if (opts?.audio && model.supportsAudio && model.audioCreditsPerSecond != null) {
    return model.audioCreditsPerSecond;
  }
  const byRes = opts?.resolution ? model.resolutionCredits?.[opts.resolution] : undefined;
  return byRes ?? model.creditsPerSecond;
}
