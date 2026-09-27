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
  | "steps"
  | "quality";

export type VideoParam =
  | "prompt"
  | "duration"
  | "resolution"
  | "aspectRatio"
  | "fps"
  | "motion"
  | "imageUpload"
  | "audio"
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

interface VideoBaseEntry extends BaseModelEntry<VideoParam> {
  /**
   * Credits charged per second = ceil(creditsPerSecond * clampedDurationSeconds).
   * This is the base/default-resolution rate; `resolutionCredits` overrides it
   * for a specific selected resolution, and `audioCreditsPerSecond` replaces it
   * when audio is on. Always resolve via videoCreditsPerSecond() so the UI and
   * the billing route stay in lockstep.
   */
  creditsPerSecond: number;
  /**
   * Per-resolution credits/second, keyed by the resolution slug ("480p" |
   * "720p" | "1080p"). fal charges ~2x more at 1080p on tiered models, so the
   * flat rate alone would go underwater there. Falls back to creditsPerSecond
   * for any resolution not listed (or when the model has no resolution param).
   */
  resolutionCredits?: Partial<Record<string, number>>;
  /** Model can generate audio (Veo 3). Gates the with/without-audio toggle. */
  supportsAudio?: boolean;
  /** credits/second billed when audio is on — fal charges more for audio. */
  audioCreditsPerSecond?: number;
  /**
   * Every clip length the provider accepts, ascending — copied from the fal
   * input schema. Many models take an enum (Wan 5/10, LTX 6/8/10), so a range
   * alone let the UI offer lengths that failed at the provider. Resolve the
   * billed length via billedDurationSeconds(), shared by the UI and the route.
   */
  durationOptions: readonly number[];
  /**
   * The JSON type the provider expects for `duration`: a bare integer (default),
   * a numeric string ("5"), or a seconds-suffixed string ("8s", Veo 3).
   */
  durationFormat?: "integer" | "string" | "seconds-suffix";
  /** The resolutions offered, when the model takes a `resolution` param. */
  resolutions?: readonly string[];
  /** === durationOptions[0]; kept for the pricing surfaces that read it. */
  minDurationSeconds: number;
  /** === the last durationOptions entry. The billed length is also clamped
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
