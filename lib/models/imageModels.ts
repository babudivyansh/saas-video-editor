import { ImageModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/image-generator/route.ts and app/components/ImageGeneratorTool.tsx both
// read this registry generically).
//
// creditCost is computed as ceil(costUsd * margin / REVENUE_FLOOR_USD_PER_CREDIT),
// the NET revenue-per-credit floor at the cheapest live SKU — $0.0784, derived and
// documented in lib/plans/tiers.ts (Studio Yearly, after 18% GST and the gateway
// fee). Margin is 3x standard / 4-5x flagship. A few entries deliberately
// keep a higher price than the formula would compute (see inline notes) —
// don't cut revenue on an already-profitable model just because the formula
// says you could charge less.
//
// supportedParameters / aspectRatios / aspectRatioFormat are copied from each
// endpoint's fal OpenAPI input schema (checked 2026-09-27). Most fal image models
// take `image_size` presets, not `aspect_ratio`: before that audit Seedream, Flux,
// Krea, Ideogram and GPT Image silently ignored the chosen ratio (always square or
// 4:3), Qwen got image_size "9:16" — not a valid preset — and Flux/Qwen/Seedream
// were sent guidance/steps/negative-prompt fields their endpoints don't have.
export const IMAGE_MODELS: readonly ImageModelEntry[] = [
  {
    id: "gemini-flash-2.0",
    // Display name follows the model the route really calls
    // (gemini-2.5-flash-image); the id stays for stored selections/analytics.
    displayName: "Gemini 2.5 Flash Image",
    provider: "Google",
    badge: "Google",
    category: "image",
    integration: "direct-gemini",
    costUsd: 0.04, // Google direct API
    creditCost: 2, // ceil(0.04*3/0.0784); default/free model, raised from 1
    allowedTiers: ["free", "creator", "pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio"],
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"], // generationConfig.imageConfig.aspectRatio
    aspectRatioFormat: "ratio",
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
    supportedParameters: ["prompt", "aspectRatio"], // no seed / negative prompt on this endpoint
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { aspectRatio: "image_size" },
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
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { aspectRatio: "image_size" },
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
    supportedParameters: ["prompt", "aspectRatio", "seed"], // flux-2-pro has no guidance/steps inputs
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { aspectRatio: "image_size" },
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
    creditCost: 5, // ceil(0.08*4/0.0784); 2 -> 4 (2026-07), 4 -> 5 on the net floor (2026-09-26)
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "aspectRatio"],
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    aspectRatioFormat: "ratio",
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
    supportedParameters: ["prompt", "aspectRatio", "seed"], // no negative prompt on v4
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { aspectRatio: "image_size" },
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
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { aspectRatio: "image_size" },
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
    creditCost: 10, // ceil(0.15*5/0.0784); flagship, studio-exclusive (8 -> 10 on the net floor)
    allowedTiers: ["studio"],
    supportedParameters: ["prompt", "aspectRatio"],
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"],
    aspectRatioFormat: "ratio",
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
    supportedParameters: ["prompt", "negativePrompt", "aspectRatio", "seed"], // no cfg_scale input
    defaultValues: { aspectRatio: "1:1" },
    aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
    aspectRatioFormat: "fal-image-size",
    inputMap: { negativePrompt: "negative_prompt", aspectRatio: "image_size" },
    resultPath: ["images.0.url", "image.url"],
    imageInput: "none",
  },
] as const;

export const DEFAULT_IMAGE_MODEL_ID = "gemini-flash-2.0";
export type ImageModelId = typeof IMAGE_MODELS[number]["id"];

export function getImageModel(id: string | undefined | null): ImageModelEntry {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL_ID)!;
}

// fal's image_size presets for the ratios the image_size models can honour.
const FAL_IMAGE_SIZE_BY_RATIO: Record<string, string> = {
  "1:1": "square_hd",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
};

/** A requested aspect ratio if this model accepts it, else its default. */
export function resolveImageAspectRatio(model: ImageModelEntry, requested?: string | null): string | undefined {
  if (!model.aspectRatios?.length) return undefined;
  if (requested && model.aspectRatios.includes(requested)) return requested;
  const def = model.defaultValues.aspectRatio;
  return typeof def === "string" && model.aspectRatios.includes(def) ? def : model.aspectRatios[0];
}

/** The aspect-ratio value in the shape this model's provider expects. */
export function providerAspectRatio(model: ImageModelEntry, ratio: string): string {
  return model.aspectRatioFormat === "fal-image-size" ? (FAL_IMAGE_SIZE_BY_RATIO[ratio] ?? "square_hd") : ratio;
}
