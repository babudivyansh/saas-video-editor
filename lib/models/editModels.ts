import type { TierId } from "@/lib/plans/tiers";

// Photo Edit: models that take an uploaded image plus an instruction and return
// the edited image. Separate from IMAGE_MODELS (text-to-image) because the
// inputs differ in kind, not just in name: every entry here needs the source
// image, some take several reference images, one takes a mask.
//
// Input keys, enums and defaults are copied from each endpoint's fal OpenAPI
// schema (https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=…, read
// 2026-11-10). The 2026-09 generator audit found half the generator's options
// were silently ignored because they had been guessed; nothing here is guessed.
//
// costUsd: fal list prices as of 2026-11. VERIFY-BEFORE-SHIP: the fal account
// was locked (exhausted balance) when this was written, so no figure below is
// from a measured call yet. creditCost follows the generator formula
// ceil(costUsd * margin / 0.0784): 3x standard, 4-5x flagship.
//
// Ids are prefixed "edit-" so admin model overrides (lib/model-overrides.ts),
// keyed by model id, never collide with the generator's.

export type EditAspectFormat = "ratio" | "fal-image-size" | "none";

export interface EditModelEntry {
  id: string;
  displayName: string;
  provider: string;
  /** One line for the model picker: what this model is best at. */
  bestFor: string;
  costUsd: number;
  creditCost: number;
  allowedTiers: readonly TierId[];
  /** Picked by the Auto router. Auto only routes to models at the base price. */
  autoEligible: boolean;
  /** Most source + reference images this model accepts in one call. */
  maxImages: number;
  integration: "direct-gemini" | "fal";
  falEndpoint?: string;
  /** How the image(s) reach the endpoint. */
  imageField?: "image_urls" | "image_url";
  /** Output shape control. "none": the model keeps the source shape. */
  aspectFormat: EditAspectFormat;
  aspectKey?: string;
  /** Fixed inputs sent on every call (quality pins, output format…). */
  fixedInput?: Record<string, unknown>;
  /** fal's batch field, when the endpoint can return several images in one call. */
  numImagesKey?: string;
  resultPath?: string[];
  /** An optional high-resolution mode at a higher price (Nano Banana Pro 4K). */
  hiRes?: { input: Record<string, unknown>; costUsd: number; creditCost: number; label: string };
}

const ALL: readonly TierId[] = ["free", "lite", "creator", "pro", "studio"];
const CREATOR_UP: readonly TierId[] = ["creator", "pro", "studio"];
const PRO_UP: readonly TierId[] = ["pro", "studio"];

export const EDIT_MODELS: readonly EditModelEntry[] = [
  {
    id: "edit-gemini-flash",
    displayName: "Gemini 2.5 Flash Image",
    provider: "Google",
    bestFor: "Everyday edits that keep faces and people unchanged",
    // Google direct API, same per-image rate the generator pays.
    costUsd: 0.039,
    creditCost: 2,
    allowedTiers: ALL,
    autoEligible: true,
    maxImages: 3,
    integration: "direct-gemini",
    aspectFormat: "none",
  },
  {
    id: "edit-qwen-2",
    displayName: "Qwen Image 2.0 Edit",
    provider: "Alibaba",
    bestFor: "Changing words on signs, posters and thumbnails",
    costUsd: 0.035,
    creditCost: 2,
    allowedTiers: ALL,
    autoEligible: true,
    maxImages: 3,
    integration: "fal",
    falEndpoint: "fal-ai/qwen-image-2/edit",
    imageField: "image_urls",
    aspectFormat: "none",
    // The router already rewrites the instruction; fal's own expansion on top
    // of that drifts from what the user asked for.
    fixedInput: { enable_prompt_expansion: false, output_format: "png" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
  },
  {
    id: "edit-flux-kontext",
    displayName: "FLUX.1 Kontext Pro",
    provider: "Black Forest Labs",
    bestFor: "Restyling, relighting and new scenes with the same subject",
    costUsd: 0.04,
    creditCost: 2,
    allowedTiers: CREATOR_UP,
    autoEligible: true,
    maxImages: 1,
    integration: "fal",
    falEndpoint: "fal-ai/flux-pro/kontext",
    imageField: "image_url",
    aspectFormat: "none",
    fixedInput: { output_format: "png" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
  },
  {
    id: "edit-seedream-5",
    displayName: "Seedream 5.0 Edit",
    provider: "ByteDance",
    bestFor: "Product shots and combining several reference images",
    costUsd: 0.035,
    creditCost: 2,
    allowedTiers: CREATOR_UP,
    autoEligible: true,
    maxImages: 6,
    integration: "fal",
    falEndpoint: "bytedance/seedream/v5/lite/edit",
    imageField: "image_urls",
    aspectFormat: "none",
    fixedInput: { image_size: "auto_2K", output_format: "png" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
  },
  {
    id: "edit-nano-banana-2",
    displayName: "Nano Banana 2 Edit",
    provider: "Google",
    bestFor: "Fine detail and consistent results over many edits",
    costUsd: 0.08,
    creditCost: 5,
    allowedTiers: PRO_UP,
    autoEligible: false,
    maxImages: 6,
    integration: "fal",
    falEndpoint: "fal-ai/nano-banana-2/edit",
    imageField: "image_urls",
    aspectFormat: "none",
    fixedInput: { resolution: "1K", output_format: "png", aspect_ratio: "auto" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
  },
  {
    id: "edit-gpt-image-2",
    displayName: "GPT Image 2 Edit",
    provider: "OpenAI",
    bestFor: "Long instructions with several changes at once",
    // Pinned to medium: fal defaults this endpoint to high (~4x the price).
    costUsd: 0.053,
    creditCost: 4,
    allowedTiers: PRO_UP,
    autoEligible: false,
    maxImages: 6,
    integration: "fal",
    falEndpoint: "openai/gpt-image-2/edit",
    imageField: "image_urls",
    aspectFormat: "none",
    fixedInput: { quality: "medium", image_size: "auto", output_format: "png" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
  },
  {
    id: "edit-nano-banana-pro",
    displayName: "Nano Banana Pro Edit",
    provider: "Google",
    bestFor: "The highest quality available, with an optional 4K output",
    costUsd: 0.15,
    creditCost: 10,
    allowedTiers: ["studio"],
    autoEligible: false,
    maxImages: 6,
    integration: "fal",
    falEndpoint: "fal-ai/nano-banana-pro/edit",
    imageField: "image_urls",
    aspectFormat: "none",
    fixedInput: { resolution: "1K", output_format: "png", aspect_ratio: "auto" },
    numImagesKey: "num_images",
    resultPath: ["images.0.url"],
    // fal bills 4K at twice the 1K rate.
    hiRes: { input: { resolution: "4K" }, costUsd: 0.30, creditCost: 20, label: "4K" },
  },
] as const;

export const DEFAULT_EDIT_MODEL_ID = "edit-gemini-flash";

export function getEditModel(id: string | null | undefined): EditModelEntry | undefined {
  return EDIT_MODELS.find((m) => m.id === id);
}

// ── One-task endpoints behind the quick actions ─────────────────────────────
// Not in the model picker: each does exactly one job.

/** Masked inpaint, also used for Expand (the padded border is the mask). */
export const INPAINT_MODEL = {
  id: "edit-flux-fill",
  displayName: "FLUX.1 Fill Pro",
  falEndpoint: "fal-ai/flux-pro/v1/fill",
  costUsd: 0.05,
  creditCost: 2,
  allowedTiers: ALL,
  resultPath: ["images.0.url"],
} as const;

/** Upscale. VERIFY-BEFORE-SHIP: SeedVR is billed per output megapixel; the
 *  figures are estimates for a ~2K source. */
export const UPSCALE_MODEL = {
  id: "edit-seedvr-upscale",
  displayName: "SeedVR2 Upscale",
  falEndpoint: "fal-ai/seedvr/upscale/image",
  costUsd: { 2: 0.02, 4: 0.06 } as Record<2 | 4, number>,
  creditCost: { 2: 1, 4: 3 } as Record<2 | 4, number>,
  allowedTiers: CREATOR_UP,
  resultPath: ["image.url"],
} as const;

/** Background removal: the same endpoint and price as the Background Remover tool. */
export const REMOVE_BG_MODEL = {
  id: "edit-rembg",
  displayName: "Background removal",
  falEndpoint: "fal-ai/imageutils/rembg",
  costUsd: 0.018,
  creditCost: 1,
  allowedTiers: ALL,
  resultPath: ["image.url"],
} as const;

/** Most variations one request may ask for. */
export const MAX_VARIATIONS = 4;

/** Cheapest edit, for "from N credits" displays. */
export const PHOTO_EDIT_STARTING_CREDIT_COST = Math.min(
  REMOVE_BG_MODEL.creditCost,
  ...EDIT_MODELS.map((m) => m.creditCost),
);
