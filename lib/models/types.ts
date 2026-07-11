// Shared types for the multi-model AI generation registries (lib/models/imageModels.ts,
// lib/models/videoModels.ts). Follows the lib/editor/types.ts, lib/social/types.ts
// precedent of colocating a feature's types alongside its config/logic.

import type { TierId } from "@/lib/plans/tiers";

export type ImageParam =
  | "prompt"
  | "negativePrompt"
  | "aspectRatio"
  | "width"
  | "height"
  | "seed"
  | "guidanceScale"
  | "steps";

export type VideoParam =
  | "prompt"
  | "duration"
  | "resolution"
  | "aspectRatio"
  | "fps"
  | "motion"
  | "imageUpload"
  | "seed";

interface BaseModelEntry<TParam extends string> {
  /** Stable slug sent as `model` in the request body and used as the registry key. */
  id: string;
  displayName: string;
  provider: string;
  /** Short badge shown next to the model name in the selector, e.g. "Google", "Fast". */
  badge?: string;
  category: "image" | "video";
  /**
   * Researched real provider $ cost, basis documented per-entry via inline
   * comment. Image: $ per generation. Video: $ per second.
   */
  costUsd: number;
  /** Plan tiers whose users may select this model. Non-empty. */
  allowedTiers: readonly TierId[];
  /**
   * Generalizes Veo3's veo3Enabled/veo3Credits special access into a named,
   * reusable mechanism instead of an isVeo3 branch: a model tagged with an
   * overridePool is accessible to a user EITHER because their plan tier is
   * in allowedTiers, OR because they hold that pool's unlock (checked via
   * lib/credits.ts's checkModelAccess), regardless of tier. Only "veo3"
   * exists as a pool today.
   */
  overridePool?: "veo3";
  supportedParameters: readonly TParam[];
  defaultValues: Partial<Record<TParam, string | number>>;
  /** Whether the frontend must require/allow/hide a reference-image upload for this model. */
  imageInput: "none" | "optional" | "required";
}

interface ImageBaseEntry extends BaseModelEntry<ImageParam> {
  /** Flat credits charged per generation (images have no duration dimension). */
  creditCost: number;
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

interface VideoBaseEntry extends BaseModelEntry<VideoParam> {
  /** Credits charged = ceil(creditsPerSecond * clampedDurationSeconds). */
  creditsPerSecond: number;
  /** Provider-supported floor, typically 2-5. */
  minDurationSeconds: number;
  /** Provider-supported ceiling — the actual billed duration is also clamped
   * by the user's plan tier via lib/plans/tiers.ts's TIER_MAX_DURATION_SECONDS. */
  maxDurationSeconds: number;
}

// Veo3 keeps its own exact-existing-behavior branch so its dispatch stays byte-identical
// to the current hand-written code path. Every other video model uses the generic FAL path.
export type VideoModelEntry =
  | (VideoBaseEntry & { integration: "direct-veo3-fast"; falEndpoint: "fal-ai/veo3/fast" })
  | (VideoBaseEntry & {
      integration: "fal";
      falEndpoint: string;
      inputMap: Partial<Record<VideoParam, string>>;
      resultPath: string[];
    });
