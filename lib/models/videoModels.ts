import { VideoModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/video-generator/route.ts and app/components/VideoGeneratorTool.tsx both
// read this registry generically).
//
// Video models are priced PER SECOND (not flat) — the actually-billed duration
// is clamped to [minDurationSeconds, min(maxDurationSeconds, tier's duration
// cap)] by the route; see lib/plans/tiers.ts's TIER_MAX_DURATION_SECONDS.
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
    badge: "20 credits",
    category: "video",
    integration: "direct-veo3-fast",
    falEndpoint: "fal-ai/veo3/fast",
    costUsd: 0.15, // $/s, with audio
    creditsPerSecond: 5, // ceil(0.15*3/0.099)
    minDurationSeconds: 5,
    maxDurationSeconds: 8, // provider ceiling for the "fast" tier
    // Pro/Studio get Veo3 as part of their plan; Creator/free users can still
    // reach it via the existing veo3Enabled/veo3Credits unlock — see overridePool.
    allowedTiers: ["pro", "studio"],
    overridePool: "veo3",
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: "8s", aspectRatio: "16:9" },
    imageInput: "optional",
  },
  {
    id: "seedance-2.0",
    displayName: "Seedance 2.0",
    provider: "ByteDance",
    badge: "ByteDance",
    category: "video",
    integration: "fal",
    // TODO verify-before-ship: confirm whether this is the standard ($0.30/s)
    // or fast ($0.24/s) tier — adjust creditsPerSecond if it's fast.
    falEndpoint: "bytedance/seedance-2.0/text-to-video",
    costUsd: 0.30,
    creditsPerSecond: 10, // ceil(0.30*3/0.099)
    minDurationSeconds: 2,
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
    // TODO verify-before-ship: no reliable per-second figure found; estimated
    // conservatively in the same ballpark as Veo3/Kling.
    costUsd: 0.125,
    creditsPerSecond: 4, // ceil(0.125*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "kling-3.0",
    displayName: "Kling 3.0",
    provider: "Kuaishou",
    badge: "Kling",
    category: "video",
    integration: "fal",
    // TODO verify-before-ship: confirm whether a text-to-video variant exists;
    // only image-to-video was confirmed, hence imageInput: "required" below.
    falEndpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    costUsd: 0.168, // audio on
    creditsPerSecond: 7, // ceil(0.168*4/0.099), flagship margin
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["studio"], // flagship, studio-exclusive
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "required",
  },
  {
    id: "grok-imagine-1.5",
    displayName: "Grok Imagine 1.5",
    provider: "xAI",
    badge: "xAI",
    category: "video",
    integration: "fal",
    // TODO verify-before-ship: confirm exact versioned path for text-to-video.
    falEndpoint: "xai/grok-imagine-video/v1.5/image-to-video",
    costUsd: 0.08,
    creditsPerSecond: 3, // kept current-equivalent — formula would allow lower
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "happyhorse-1.0",
    displayName: "HappyHorse 1.0",
    provider: "Alibaba",
    badge: "Alibaba",
    category: "video",
    integration: "fal",
    falEndpoint: "alibaba/happy-horse/text-to-video",
    // TODO verify-before-ship: resolution (720p vs 1080p) unconfirmed —
    // 720p=$0.14/s (used here), 1080p=$0.28/s would need creditsPerSecond: 9.
    costUsd: 0.14,
    creditsPerSecond: 5, // ceil(0.14*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "imageUpload"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "wan-2.7",
    displayName: "Wan 2.7",
    provider: "Alibaba",
    badge: "Wan",
    category: "video",
    integration: "fal",
    falEndpoint: "fal-ai/wan/v2.7/text-to-video",
    costUsd: 0.10,
    creditsPerSecond: 4, // ceil(0.10*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
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
    // TODO verify-before-ship: confirm the actual base generate endpoint; only
    // `/extend-video` and `/render-to-real` were confirmed during research.
    falEndpoint: "fal-ai/ltx-2.3-quality/text-to-video",
    costUsd: 0.08, // quality tier, 1080p
    creditsPerSecond: 3, // ceil(0.08*3/0.099)
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p" },
    inputMap: {},
    resultPath: ["video.url"],
    imageInput: "optional",
  },
  {
    id: "pixverse-v6",
    displayName: "PixVerse V6",
    provider: "PixVerse",
    badge: "PixVerse",
    category: "video",
    integration: "fal",
    // TODO verify-before-ship: only the image-to-video slug was confirmed;
    // hence imageInput: "required" below until a text-to-video slug is confirmed.
    // Cost estimated from v5.6's $0.45/5s@720p (~$0.09/s) — weak data, reconfirm.
    falEndpoint: "fal-ai/pixverse/v6/image-to-video",
    costUsd: 0.09,
    creditsPerSecond: 3, // ceil(0.09*3/0.099)
    minDurationSeconds: 2,
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
