// Client-safe half of lib/autoclip-ai/config.ts (no Prisma): the admin page
// imports the feature list, the types and the defaults from here.
//
// Admin-editable switches for AutoClip's AI B-roll, reframing and keyframing.
//
// Same shape as getGpuRouting (lib/render-target.ts): one JSON row in the
// Config table, merged over the defaults below, so a feature can be turned on
// for one tier, watched, and widened without a deploy.
//
// Every feature defaults to OFF except generated B-roll, which replaced the
// old stock-footage B-roll (2026-11-21) and so is on wherever B-roll used to
// be. Nothing here is allowed to throw: a broken row degrades to the defaults.

import { TIER_ORDER, type TierId } from "@/lib/plans/tiers";

export const CONFIG_KEY = "autoclip_ai";

/**
 * Bumped when a default changes in a way a saved row must not override. The
 * admin page saves the WHOLE merged config, so a row saved under v1 holds
 * v1's defaults as if an admin had chosen them. v2 (2026-11-21) turned
 * generated B-roll on for every plan when stock B-roll was removed; a v1
 * row's B-roll settings are ignored so that change actually takes effect.
 */
export const CONFIG_VERSION = 2;

export const AI_FEATURES = [
  /** Stage 1: Gemini plans punch-ins, resets, B-roll timing and layout per clip. */
  "editPlan",
  /** B-roll: an AI-generated still with a slow camera move, for every B-roll window. */
  "brollGenerateImage",
  /** B-roll: an AI video insert instead of a still. Also needs the user's opt-in per run. */
  "brollGenerateVideo",
  /** Stage 3: restart the crop path at every hard cut instead of panning across it. */
  "shotAwareReframe",
  /** Stage 4: Gemini watches each clip and labels every shot's layout and subject. */
  "sceneVision",
  /** Stage 5: SAM 2 tracks a non-face subject (product, screen, hands). */
  "subjectTrack",
  /** Stage 5: hold-then-ease camera path instead of following every drift. */
  "cameraPath",
  /** Stage 5: cut to the next speaker just before they talk, not after. */
  "speakerLead",
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface FeatureGate {
  enabled: boolean;
  /** Tiers the feature runs for. Empty = nobody. */
  tiers: TierId[];
}

export interface AutoClipAiConfig {
  v: number;
  features: Record<AiFeature, FeatureGate>;
  broll: {
    /** Generated inserts (image or video) per clip, at most. */
    maxGeneratedPerClip: number;
    /** fal endpoint for generated stills. */
    imageModel: string;
    /** fal endpoint for generated video. Kept here so it changes without a deploy. */
    videoModel: string;
  };
  /** Most a single run may spend on optional AI work, in USD, per tier. */
  costCeilingUsd: Record<TierId, number>;
  /**
   * What each call is assumed to cost, in USD. Estimates — the providers bill
   * the real amount; these exist so the per-run ceiling can be enforced
   * BEFORE a call is made. Keep them at or above the real prices.
   */
  unitCostUsd: {
    geminiText: number;
    geminiVideoPerMin: number;
    falImage: number;
    falVideo: number;
    gpuTrackPerMin: number;
  };
}

const ALL_TIERS: TierId[] = [...TIER_ORDER];
const off = (tiers: TierId[] = ALL_TIERS): FeatureGate => ({ enabled: false, tiers });

export const AUTOCLIP_AI_DEFAULTS: AutoClipAiConfig = {
  v: CONFIG_VERSION,
  features: {
    editPlan: off(),
    // On for everyone: it is the only B-roll there is now. Each plan's per-run
    // spending cap (costCeilingUsd) bounds how many stills a run can make.
    brollGenerateImage: { enabled: true, tiers: ALL_TIERS },
    brollGenerateVideo: off(["studio"]),
    shotAwareReframe: off(),
    sceneVision: off(["creator", "pro", "studio"]),
    subjectTrack: off(["pro", "studio"]),
    cameraPath: off(),
    speakerLead: off(),
  },
  broll: {
    maxGeneratedPerClip: 3,
    imageModel: "fal-ai/flux/schnell",
    videoModel: "fal-ai/ltx-video",
  },
  costCeilingUsd: { free: 0.05, creator: 0.25, pro: 0.6, studio: 1.5 },
  unitCostUsd: {
    geminiText: 0.002,
    geminiVideoPerMin: 0.02,
    falImage: 0.005,
    falVideo: 0.25,
    gpuTrackPerMin: 0.03,
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep-merge a stored (possibly partial or stale) row over the defaults. */
export function mergeAutoClipAiConfig(stored: unknown): AutoClipAiConfig {
  const d = AUTOCLIP_AI_DEFAULTS;
  if (!isObj(stored)) return structuredClone(d);
  const out = structuredClone(d);

  // A row saved before v2 carries the old "generated B-roll off, 2 per clip"
  // defaults as if chosen; take the current ones for those instead.
  const legacy = stored.v !== CONFIG_VERSION;

  if (isObj(stored.features)) {
    for (const f of AI_FEATURES) {
      if (legacy && f === "brollGenerateImage") continue;
      const g = stored.features[f];
      if (!isObj(g)) continue;
      if (typeof g.enabled === "boolean") out.features[f].enabled = g.enabled;
      if (Array.isArray(g.tiers)) {
        out.features[f].tiers = g.tiers.filter((t): t is TierId => (TIER_ORDER as readonly string[]).includes(String(t)));
      }
    }
  }
  if (isObj(stored.broll)) {
    const b = stored.broll;
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
    if (!legacy) out.broll.maxGeneratedPerClip = Math.round(num(b.maxGeneratedPerClip, 0, 3, d.broll.maxGeneratedPerClip));
    if (typeof b.imageModel === "string" && /^[\w./-]{3,100}$/.test(b.imageModel)) out.broll.imageModel = b.imageModel;
    if (typeof b.videoModel === "string" && /^[\w./-]{3,100}$/.test(b.videoModel)) out.broll.videoModel = b.videoModel;
  }
  if (isObj(stored.costCeilingUsd)) {
    for (const t of TIER_ORDER) {
      const v = stored.costCeilingUsd[t];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out.costCeilingUsd[t] = Math.min(v, 20);
    }
  }
  if (isObj(stored.unitCostUsd)) {
    for (const k of Object.keys(d.unitCostUsd) as (keyof AutoClipAiConfig["unitCostUsd"])[]) {
      const v = stored.unitCostUsd[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out.unitCostUsd[k] = v;
    }
  }
  return out;
}

/** Plain-object deep merge for an admin PATCH; arrays and scalars in `patch` replace. */
export function deepMergeConfig(base: unknown, patch: unknown): unknown {
  if (!isObj(base) || !isObj(patch)) return patch === undefined ? base : patch;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = deepMergeConfig(base[k], v);
  return out;
}


/** True when `feature` is switched on and `tier` is in its list. */
export function aiFeatureOn(cfg: AutoClipAiConfig, feature: AiFeature, tier: TierId): boolean {
  const g = cfg.features[feature];
  return g.enabled && g.tiers.includes(tier);
}

/** Every feature resolved for one tier: what a run actually gets. */
export type AiFeatureSet = Record<AiFeature, boolean>;

export function resolveAiFeatures(cfg: AutoClipAiConfig, tier: TierId): AiFeatureSet {
  return Object.fromEntries(AI_FEATURES.map((f) => [f, aiFeatureOn(cfg, f, tier)])) as AiFeatureSet;
}

export const NO_AI_FEATURES: AiFeatureSet = Object.fromEntries(AI_FEATURES.map((f) => [f, false])) as AiFeatureSet;
