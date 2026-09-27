// Shared types for the multi-model AI image registry (lib/models/imageModels.ts).
// Follows the lib/editor/types.ts, lib/social/types.ts precedent of colocating a feature's types alongside its config/logic.

import type { TierId } from "@/lib/plans/tiers";

export type ImageParam =
  | "prompt"
  | "negativePrompt"
  | "aspectRatio"
  | "width"
  | "height"
  | "seed"
  | "guidanceScale"
  | "steps"
  | "quality";

interface BaseModelEntry<TParam extends string> {
  /** Stable slug sent as `model` in the request body and used as the registry key. */
  id: string;
  displayName: string;
  provider: string;
  /** Short badge shown next to the model name in the selector, e.g. "Google", "Fast". */
  badge?: string;
  category: "image";
  /**
   * Researched real provider $ cost per generation, basis documented
   * per-entry via inline comment.
   */
  costUsd: number;
  /** Plan tiers whose users may select this model. Non-empty. */
  allowedTiers: readonly TierId[];
  supportedParameters: readonly TParam[];
  defaultValues: Partial<Record<TParam, string | number>>;
  /** Whether the frontend must require/allow/hide a reference-image upload for this model. */
  imageInput: "none" | "optional" | "required";
  /**
   * The aspect ratios the provider actually accepts, as "W:H" slugs. The UI
   * offers exactly these and the route falls back to the model's default for
   * anything else, so a user can never pick a shape the provider would reject
   * (or silently ignore). Required whenever `aspectRatio` is a supported param.
   */
  aspectRatios?: readonly string[];
}

interface ImageBaseEntry extends BaseModelEntry<ImageParam> {
  /** Flat credits charged per generation (images have no duration dimension). */
  creditCost: number;
  /**
   * How the aspect ratio reaches the provider. "ratio" sends the slug as-is
   * (e.g. "16:9"); "fal-image-size" translates it to fal's `image_size` preset
   * enum (e.g. "landscape_16_9"), which is what most fal image models take —
   * they silently ignore an `aspect_ratio` key, or reject a ratio slug.
   */
  aspectRatioFormat?: "ratio" | "fal-image-size";
}

// Gemini has no FAL endpoint at all — it's called directly against Google's REST API.
// Every other image model dispatches through FAL with a generic submit/poll/extract path.
export type ImageModelEntry =
  | (ImageBaseEntry & { integration: "direct-gemini" })
  | (ImageBaseEntry & {
      integration: "fal";
      falEndpoint: string;
      /** Registry param name -> exact FAL JSON input key, where it differs (e.g. "negative_prompt"). */
      inputMap: Partial<Record<ImageParam, string>>;
      /** Dot-paths tried in order against the FAL result JSON (e.g. "images.0.url"). */
      resultPath: string[];
    });
