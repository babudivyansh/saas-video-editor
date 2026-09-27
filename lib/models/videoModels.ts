import { VideoModelEntry } from "./types";

// Adding a model only requires adding an entry here — no other file needs to change
// (app/api/tools/video-generator/route.ts and app/components/VideoGeneratorTool.tsx both
// read this registry generically).
//
// Video models are priced PER SECOND (not flat). The billed length is one of the
// model's durationOptions, capped by the user's plan tier (lib/plans/tiers.ts's
// TIER_MAX_DURATION_SECONDS) — resolve it with billedDurationSeconds(), which the
// route and the UI share, so the credits shown are the credits charged.
// Every model (including Veo3) is gated purely by allowedTiers and billed
// from the one standard credit pool — no per-model special-casing.
// creditsPerSecond = ceil(costUsd(per second) * margin / REVENUE_FLOOR_USD_PER_CREDIT),
// the same floor imageModels.ts uses — $0.0784 NET (after GST + gateway), derived in
// lib/plans/tiers.ts. Raised 2026-09-26: rates were set against the $0.0952 gross
// figure, so "3x" was really ~2.4x after tax.
// Margin 3x standard / 4x flagship.
//
// durationOptions / durationFormat / resolutions / aspectRatios / imageInput are
// copied from each endpoint's fal OpenAPI input schema (checked 2026-09-27 via
// https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<falEndpoint>).
// Before that audit the UI offered one shared 2-15s range, 480-1080p and 16:9 /
// 9:16 / 1:1 to every model, so many combinations — including Veo 3's and LTX's
// defaults — failed at fal and were refunded. A reference image is only offered
// where the endpoint takes `image_url`: the text-to-video endpoints dropped it.
//
// `id` for Veo3 is kept exactly "veo3-fast" to match the value the frontend has always
// initialized its model state to (and always sent, even before the backend honored it).

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

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
    creditsPerSecond: 10, // audio off: ceil(0.25*3/0.0784)
    audioCreditsPerSecond: 16, // audio on: ceil(0.40*3/0.0784)
    supportsAudio: true,
    // fal: duration is the string enum "4s" | "6s" | "8s" — a bare number fails.
    durationOptions: [4, 6, 8],
    durationFormat: "seconds-suffix",
    minDurationSeconds: 4,
    maxDurationSeconds: 8,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio", "audio"],
    defaultValues: { duration: "8s", aspectRatio: "16:9", audio: "on" },
    aspectRatios: ["16:9", "9:16"],
    imageInput: "none", // text-to-video endpoint: no image_url
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
    creditsPerSecond: 12, // 720p: ceil(0.3034*3/0.0784)
    // 1080p raised 21 -> 22 by the 2026-09-01 audit, then 22 -> 27 on 2026-09-26
    // when the floor moved from gross to net-of-GST ($0.0784).
    resolutionCredits: { "720p": 12, "1080p": 27 }, // 1080p: ceil(0.682*3/0.0784)
    // fal also takes 480p and 4k, but neither cost is audited — not offered.
    resolutions: ["720p", "1080p"],
    durationOptions: range(4, 15), // fal: string enum "4".."15" (or "auto")
    durationFormat: "string",
    minDurationSeconds: 4,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "none", // text-to-video endpoint: no image_url
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
    creditsPerSecond: 5, // ceil(0.125*3/0.0784)
    durationOptions: range(3, 10), // fal: integer 3-10
    minDurationSeconds: 3,
    maxDurationSeconds: 10,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "aspectRatio"],
    defaultValues: { duration: 5, aspectRatio: "16:9" },
    aspectRatios: ["16:9", "9:16"],
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "none",
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
    // Image-to-video only: fal requires image_url, and the frame sets the shape.
    falEndpoint: "xai/grok-imagine-video/v1.5/image-to-video",
    costUsd: 0.14, // $/s at the default 720p
    creditsPerSecond: 6, // 720p: ceil(0.14*3/0.0784)
    resolutionCredits: { "480p": 4, "720p": 6, "1080p": 10 },
    resolutions: ["480p", "720p", "1080p"],
    durationOptions: range(2, 15), // fal: integer 1-15
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "imageUpload"],
    defaultValues: { duration: 5, resolution: "720p" },
    inputMap: {},
    resultPath: ["video.url"],
    imageInput: "required",
  },
  // Kling 3.0 is pulled from the registry until its per-second cost and
  // endpoint are verified with the provider (2026-07 pricing audit): a
  // studio-exclusive flagship with an unconfirmed cost is exactly the
  // pre-duration-scaling ai-creator loss-maker pattern. Re-add the entry
  // (studio-only, creditsPerSecond = ceil(costUsd*4/0.0784)) once confirmed.
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
    creditsPerSecond: 6, // 720p: ceil(0.14*3/0.0784)
    resolutionCredits: { "720p": 6, "1080p": 11 }, // 1080p: ceil(0.28*3/0.0784)
    resolutions: ["720p", "1080p"],
    durationOptions: range(3, 15), // fal: integer enum 3-15
    minDurationSeconds: 3,
    maxDurationSeconds: 15,
    allowedTiers: ["pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "none", // text-to-video endpoint: no image_url
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
    creditsPerSecond: 4, // 720p: ceil(0.10*3/0.0784)
    resolutionCredits: { "480p": 2, "720p": 4, "1080p": 6 }, // 480p ceil(0.05*3/0.0784), 1080p ceil(0.15*3/0.0784)
    resolutions: ["480p", "720p", "1080p"],
    durationOptions: [5, 10], // fal: string enum "5" | "10"
    durationFormat: "string",
    minDurationSeconds: 5,
    maxDurationSeconds: 10,
    allowedTiers: ["creator", "pro", "studio"],
    // No fps input on this endpoint — the old FPS picker did nothing.
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio"],
    defaultValues: { duration: 5, resolution: "720p", aspectRatio: "16:9" },
    aspectRatios: ["16:9", "9:16", "1:1"],
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "none", // text-to-video endpoint: no image_url
  },
  {
    id: "ltx-2.3",
    displayName: "LTX 2.3",
    provider: "Lightricks",
    badge: "LTX",
    category: "video",
    integration: "fal",
    // fal fal-ai/ltx-2.3/text-to-video (2026-08 audit): 1080p $0.06/s (cheapest
    // tier). costUsd kept a touch high at $0.08 for safety headroom; 4 cr/s is
    // ~5x at the real cost. fal also takes 1440p/2160p — unaudited, not offered.
    falEndpoint: "fal-ai/ltx-2.3/text-to-video",
    costUsd: 0.08, // conservative; real 1080p is $0.06/s
    creditsPerSecond: 4, // ceil(0.08*3/0.0784); ~5x at the real $0.06
    resolutions: ["1080p"], // fal minimum; the old 480p/720p default was rejected
    durationOptions: [6, 8, 10], // fal: integer enum 6 | 8 | 10
    minDurationSeconds: 6,
    maxDurationSeconds: 10,
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "resolution", "aspectRatio"],
    defaultValues: { duration: 6, resolution: "1080p", aspectRatio: "16:9" },
    aspectRatios: ["16:9", "9:16"],
    inputMap: { aspectRatio: "aspect_ratio" },
    resultPath: ["video.url"],
    imageInput: "none", // text-to-video endpoint
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
    // verify-before-ship: confirm the $/s on fal. v5.6 is reported ~$0.01/s;
    // 4 cr/s clears 3x even at the conservative $0.09 and the model is creator+
    // gated, so the unverified cost is mitigated. Image-to-video only: fal
    // requires image_url, and the frame sets the shape (no aspect_ratio input).
    falEndpoint: "fal-ai/pixverse/v5.6/image-to-video",
    costUsd: 0.09, // conservative; reported real is ~$0.01/s
    creditsPerSecond: 4, // ceil(0.09*3/0.0784)
    durationOptions: [5, 8, 10], // fal: string enum "5" | "8" | "10"
    durationFormat: "string",
    minDurationSeconds: 5,
    maxDurationSeconds: 10,
    allowedTiers: ["creator", "pro", "studio"],
    supportedParameters: ["prompt", "duration", "imageUpload"],
    defaultValues: { duration: 5 },
    inputMap: {},
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
 * The lengths a user on this plan can pick: the model's own options up to the
 * tier cap. Should a cap ever sit below the model's shortest option, that
 * shortest option is still allowed — refusing would
 * make the model unusable on a tier it is sold on, and the price scales anyway.
 */
export function allowedDurations(model: VideoModelEntry, tierCap: number): number[] {
  const within = model.durationOptions.filter((s) => s <= tierCap);
  return within.length > 0 ? within : [model.durationOptions[0]];
}

/**
 * The length actually generated and billed for a requested one: the longest
 * allowed option that doesn't exceed the request, else the shortest allowed.
 * Shared by the route and the UI, so the seconds shown are the seconds billed.
 */
export function billedDurationSeconds(model: VideoModelEntry, requested: number, tierCap: number): number {
  const allowed = allowedDurations(model, tierCap);
  if (!Number.isFinite(requested)) requested = defaultDurationSeconds(model);
  const fits = allowed.filter((s) => s <= requested);
  return fits.length > 0 ? fits[fits.length - 1] : allowed[0];
}

/** The model's default length in seconds (the registry may store "8s"). */
export function defaultDurationSeconds(model: VideoModelEntry): number {
  const raw = model.defaultValues.duration;
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  const opts = model.durationOptions;
  if (!Number.isFinite(n)) return opts[0];
  const fits = opts.filter((s) => s <= n);
  return fits.length > 0 ? fits[fits.length - 1] : opts[0];
}

/** `duration` in the JSON type this model's fal endpoint expects. */
export function formatDurationForProvider(model: VideoModelEntry, seconds: number): number | string {
  if (model.durationFormat === "seconds-suffix") return `${seconds}s`;
  if (model.durationFormat === "string") return String(seconds);
  return seconds;
}

/** A requested resolution if this model offers it, else its default. */
export function resolveResolution(model: VideoModelEntry, requested?: string | null): string | undefined {
  if (!model.resolutions?.length) return undefined;
  if (requested && model.resolutions.includes(requested)) return requested;
  const def = model.defaultValues.resolution;
  return typeof def === "string" && model.resolutions.includes(def) ? def : model.resolutions[0];
}

/** A requested aspect ratio if this model accepts it, else its default. */
export function resolveVideoAspectRatio(model: VideoModelEntry, requested?: string | null): string | undefined {
  if (!model.aspectRatios?.length) return undefined;
  if (requested && model.aspectRatios.includes(requested)) return requested;
  const def = model.defaultValues.aspectRatio;
  return typeof def === "string" && model.aspectRatios.includes(def) ? def : model.aspectRatios[0];
}

/**
 * The effective PROVIDER COST per second for the options actually requested.
 *
 * `costUsd` on the entry is only the base (default-resolution, audio-off) rate,
 * so logging it verbatim under-reported real spend by 38% on Veo 3 with audio
 * and 55% on Seedance at 1080p — the two priciest things we sell. The per-option
 * real costs live in the audit comment on each entry and are mirrored here so
 * cost analytics track what we were actually billed.
 */
export function effectiveCostUsdPerSecond(
  model: VideoModelEntry,
  opts?: { resolution?: string; audio?: boolean },
): number {
  const byOption = REAL_COST_USD_PER_SECOND[model.id];
  if (opts?.audio && model.supportsAudio && byOption?.audio != null) return byOption.audio;
  const byRes = opts?.resolution ? byOption?.[opts.resolution] : undefined;
  return byRes ?? model.costUsd;
}

/**
 * Audited real fal $/s by resolution and audio flag (2026-08), for the models
 * whose cost varies by option. Kept beside the registry rather than inside each
 * entry so the shape of VideoModelEntry doesn't change; lib/models/pricing.test.ts
 * holds the same figures and would fail if a credit rate stopped covering them.
 */
const REAL_COST_USD_PER_SECOND: Record<string, Record<string, number>> = {
  "veo3-fast": { audio: 0.40 },
  "seedance-2.0": { "720p": 0.3034, "1080p": 0.682 },
  "grok-imagine-1.5": { "480p": 0.08, "720p": 0.14, "1080p": 0.25 },
  "happyhorse-1.0": { "720p": 0.14, "1080p": 0.28 },
  "wan-2.7": { "480p": 0.05, "720p": 0.10, "1080p": 0.15 },
};

/**
 * The effective credits-per-second for a model given the selected resolution and
 * audio flag. Single source of truth shared by the billing route and the
 * generator UI so the credits shown never drift from what's charged.
 *
 * Precedence: audio-on rate (if audio && supported) → per-resolution rate →
 * flat base rate. `overrideCreditsPerSecond` (admin runtime reprice) replaces the
 * BASE rate and scales the audio / resolution tiers in proportion — it used to
 * replace every tier outright, so repricing Veo 3 to 12 also dropped its
 * audio-on rate from 16 to 12, below cost-plus-margin.
 */
export function videoCreditsPerSecond(
  model: VideoModelEntry,
  opts?: { resolution?: string; audio?: boolean; overrideCreditsPerSecond?: number },
): number {
  let rate = model.creditsPerSecond;
  if (opts?.audio && model.supportsAudio && model.audioCreditsPerSecond != null) {
    rate = model.audioCreditsPerSecond;
  } else {
    const byRes = opts?.resolution ? model.resolutionCredits?.[opts.resolution] : undefined;
    if (byRes != null) rate = byRes;
  }
  const override = opts?.overrideCreditsPerSecond;
  if (override == null) return rate;
  return Math.ceil((rate * override) / model.creditsPerSecond);
}

/**
 * The cheapest run a user can actually start on this model: its shortest
 * length at its cheapest offered resolution, audio off. Drives the "from N
 * credits" figures, which used to multiply the base rate by a minimum length
 * the provider rejected.
 */
export function cheapestRunCredits(model: VideoModelEntry): number {
  const rates = model.resolutions?.length
    ? model.resolutions.map((r) => videoCreditsPerSecond(model, { resolution: r }))
    : [model.creditsPerSecond];
  return Math.ceil(Math.min(...rates) * model.durationOptions[0]);
}
