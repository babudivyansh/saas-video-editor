import { ImageModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/image-generator/route.ts and app/components/ImageGeneratorTool.tsx both
// read this registry generically).
//
// creditCost is computed as ceil(costUsd * margin / REVENUE_FLOOR_USD_PER_CREDIT),
// the revenue-per-credit floor at the cheapest live SKU — $0.0952, derived and
// documented in lib/plans/tiers.ts (Studio Yearly, ₹8.37/credit at 88 INR/USD).
// The old "$0.099 / ₹9.41 at ₹95/$1" figure here went stale when the grants moved
// to 60/160/400 and the FX default moved to 88. Margin is 3x standard / 4-5x
// flagship. A few entries deliberately
// keep a higher price than the formula would compute (see inline notes) —
// don't cut revenue on an already-profitable model just because the formula
// says you could charge less.
export const IMAGE_MODELS: readonly ImageModelEntry[] = [
  {
    id: "gemini-flash-2.0",
    displayName: "Gemini Flash 2.0",
    provider: "Google",
    badge: "Google",
    category: "image",
    integration: "direct-gemini",
    costUsd: 0.04, // Google direct API
    creditCost: 2, // ceil(0.04*3/0.0952); default/free model, raised from 1
    allowedTiers: ["free", "creator", "pro", "studio"],
    supportedParameters: ["prompt"],
    defaultValues: {},
    imageInput: "none",
  },
  {
    id: "seedream-5.0",
    displayName: "Seedream 5.0",
    provider: "ByteDance",
    badge: "ByteDance",
    category: "image",
    integration: "fal",
    falEndpoint: "bytedance/seedream/v5/lite/text-to-image",
    costUsd: 0.035, // fal Seedream 5.0 Lite (2026-08 audit): $0.035/image
    creditCost: 2, // ~5.7x at real cost — healthy
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "negativePrompt", "aspectRatio", "seed"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { negativePrompt: "negative_prompt", aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    provider: "OpenAI",
    badge: "OpenAI",
    category: "image",
    integration: "fal",
    falEndpoint: "openai/gpt-image-2",
    // fal defaults gpt-image-2 to `high` ($0.211/image); we pin `medium` ($0.053)
    // to keep the 6-credit price comfortably profitable (~11x) instead of ~2.8x.
    costUsd: 0.053, // medium quality (explicitly requested below)
    creditCost: 6, // kept — premium brand pricing at medium quality
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio", "quality"],
    defaultValues: { aspectRatio: "1:1", quality: "medium" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "flux-2",
    displayName: "Flux 2",
    provider: "Black Forest Labs",
    badge: "Flux",
    category: "image",
    integration: "fal",
    falEndpoint: "fal-ai/flux-2-pro",
    costUsd: 0.03,
    creditCost: 3, // kept current
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio", "seed", "guidanceScale", "steps"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { aspectRatio: "aspect_ratio", guidanceScale: "guidance_scale", steps: "num_inference_steps" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "nano-banana-2",
    displayName: "Nano Banana 2",
    provider: "Google",
    badge: "Google",
    category: "image",
    integration: "fal",
    falEndpoint: "fal-ai/nano-banana-2",
    costUsd: 0.08,
    creditCost: 4, // ceil(0.08*4/0.0952); raised from 2, was underpriced at 2.48x margin
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "ideogram-4",
    displayName: "Ideogram 4",
    provider: "Ideogram",
    badge: "Ideogram",
    category: "image",
    integration: "fal",
    // TODO verify-before-ship: confirm exact tier slug (`/fast` vs `/instant`).
    falEndpoint: "ideogram/v4/fast",
    costUsd: 0.015,
    creditCost: 3, // kept current
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "negativePrompt", "aspectRatio", "seed"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { negativePrompt: "negative_prompt", aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "krea-2",
    displayName: "Krea 2",
    provider: "Krea",
    badge: "Krea",
    category: "image",
    integration: "fal",
    falEndpoint: "fal-ai/krea-2/turbo",
    costUsd: 0.03,
    creditCost: 2, // kept current
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio", "seed"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    provider: "Google",
    badge: "Google",
    category: "image",
    integration: "fal",
    falEndpoint: "fal-ai/nano-banana-pro",
    costUsd: 0.15, // 1K output
    creditCost: 8, // ceil(0.15*5/0.0952); raised from 4, flagship, studio-exclusive
    allowedTiers: ["studio"],
    supportedParameters: ["prompt", "aspectRatio"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
  {
    id: "qwen-image-2.0",
    displayName: "Qwen Image 2.0",
    provider: "Alibaba",
    badge: "Qwen",
    category: "image",
    integration: "fal",
    falEndpoint: "fal-ai/qwen-image-2/text-to-image",
    costUsd: 0.035, // fal Qwen Image 2.0 (2026-08 audit): $0.035/image
    creditCost: 2, // raised from 1: at $0.035 real, 1 credit was only 2.8x
    allowedTiers: ["free", "creator", "pro", "studio"],
    supportedParameters: ["prompt", "negativePrompt", "aspectRatio", "seed", "guidanceScale"],
    defaultValues: { aspectRatio: "1:1" },
    inputMap: { negativePrompt: "negative_prompt", aspectRatio: "image_size", guidanceScale: "cfg_scale" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
] as const;

export const DEFAULT_IMAGE_MODEL_ID = "gemini-flash-2.0";
export type ImageModelId = typeof IMAGE_MODELS[number]["id"];

export function getImageModel(id: string | undefined | null): ImageModelEntry {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL_ID)!;
}
