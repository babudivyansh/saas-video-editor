// Shared types for the multi-model AI generation registries (lib/models/imageModels.ts,
// lib/models/videoModels.ts). Follows the lib/editor/types.ts, lib/social/types.ts
// precedent of colocating a feature's types alongside its config/logic.

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
  /** Credits deducted per generation with this model. */
  creditCost: number;
  supportedParameters: readonly TParam[];
  defaultValues: Partial<Record<TParam, string | number>>;
  /** Whether the frontend must require/allow/hide a reference-image upload for this model. */
  imageInput: "none" | "optional" | "required";
}

// Gemini has no FAL endpoint at all — it's called directly against Google's REST API.
// Every other image model dispatches through FAL with a generic submit/poll/extract path.
export type ImageModelEntry =
  | (BaseModelEntry<ImageParam> & { integration: "direct-gemini" })
  | (BaseModelEntry<ImageParam> & {
      integration: "fal";
      falEndpoint: string;
      /** Registry param name -> exact FAL JSON input key, where it differs (e.g. "negative_prompt"). */
      inputMap: Partial<Record<ImageParam, string>>;
      /** Dot-paths tried in order against the FAL result JSON (e.g. "images.0.url"). */
      resultPath: string[];
    });

// Veo3 keeps its own exact-existing-behavior branch so its dispatch stays byte-identical
// to the current hand-written code path. Every other video model uses the generic FAL path.
export type VideoModelEntry =
  | (BaseModelEntry<VideoParam> & { integration: "direct-veo3-fast"; falEndpoint: "fal-ai/veo3/fast" })
  | (BaseModelEntry<VideoParam> & {
      integration: "fal";
      falEndpoint: string;
      inputMap: Partial<Record<VideoParam, string>>;
      resultPath: string[];
    });
