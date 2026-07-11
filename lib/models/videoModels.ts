import { VideoModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/video-generator/route.ts and app/components/VideoGeneratorTool.tsx both
// read this registry generically). Credit costs are rough placeholders reflecting relative
// FAL pricing tiers; adjust to match actual billed usage before shipping.
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
    creditCost: 35,
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
    falEndpoint: "bytedance/seedance-2.0/text-to-video",
    creditCost: 30,
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
    creditCost: 25,
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
    creditCost: 40,
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
    creditCost: 30,
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
    creditCost: 30,
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
    creditCost: 20,
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
    creditCost: 15,
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
    falEndpoint: "fal-ai/pixverse/v6/image-to-video",
    creditCost: 20,
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
