// Client-safe half of lib/autoclip-ai/config.ts (no Prisma): the admin page
// imports the feature list, the types and the defaults from here.
//
// Admin-editable switches for AutoClip's AI B-roll, reframing and keyframing.
//
// Same shape as getGpuRouting (lib/render-target.ts): one JSON row in the
// Config table, merged over the defaults below, so a feature can be turned on
// for one tier, watched, and widened without a deploy.
//
// EVERY feature defaults to OFF. With this row absent a run behaves exactly as
// it did before these features existed — that is the rollback, and it is why
// nothing here is allowed to throw: a broken row degrades to the defaults.

import { TIER_ORDER, type TierId } from "@/lib/plans/tiers";

export const CONFIG_KEY = "autoclip_ai";

export const AI_FEATURES = [
  /** Stage 1: Gemini plans punch-ins, resets, B-roll timing and layout per clip. */
  "editPlan",
  /** Stage 2: search several B-roll sources and let AI choose (or choose nothing). */
  "brollRank",
  /** Stage 2: an AI still with a slow pan when no stock clip fits. */
  "brollGenerateImage",
  /** Stage 2: an AI video insert. Also needs the user's own opt-in per run. */
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

export const BROLL_PROVIDERS = [
  "pexels", "pixabay", "coverr", "giphy", "library", "source",
] as const;
export type BrollProviderId = (typeof BROLL_PROVIDERS)[number];

export interface FeatureGate {
  enabled: boolean;
  /** Tiers the feature runs for. Empty = nobody. */
  tiers: TierId[];
}

export interface AutoClipAiConfig {
  features: Record<AiFeature, FeatureGate>;
  broll: {
    providers: Record<BrollProviderId, boolean>;
    /** Which ranker scores stock candidates. The library always uses embeddings. */
    ranker: "gemini" | "embedding";
    /** Ranker score (0-100) a candidate needs; below it the window gets no stock clip. */
    threshold: number;
    /** Added to the user's own footage, so it wins a near tie with generic stock. */
    libraryBonus: number;
    /** Results asked of each provider per query. */
    candidatesPerProvider: number;
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
    geminiVision: number;
    geminiVideoPerMin: number;
    falImage: number;
    falVideo: number;
    gpuEmbed: number;
    gpuTrackPerMin: number;
  };
}

const ALL_TIERS: TierId[] = [...TIER_ORDER];
const off = (tiers: TierId[] = ALL_TIERS): FeatureGate => ({ enabled: false, tiers });

export const AUTOCLIP_AI_DEFAULTS: AutoClipAiConfig = {
  features: {
    editPlan: off(),
    brollRank: off(),
    brollGenerateImage: off(["creator", "pro", "studio"]),
    brollGenerateVideo: off(["studio"]),
    shotAwareReframe: off(),
    sceneVision: off(["creator", "pro", "studio"]),
    subjectTrack: off(["pro", "studio"]),
    cameraPath: off(),
    speakerLead: off(),
  },
  broll: {
    providers: { pexels: true, pixabay: true, coverr: false, giphy: true, library: true, source: true },
    ranker: "gemini",
    threshold: 60,
    libraryBonus: 8,
    candidatesPerProvider: 8,
    maxGeneratedPerClip: 2,
    imageModel: "fal-ai/flux/schnell",
    videoModel: "fal-ai/ltx-video",
  },
  costCeilingUsd: { free: 0.05, creator: 0.25, pro: 0.6, studio: 1.5 },
  unitCostUsd: {
    geminiText: 0.002,
    geminiVision: 0.003,
    geminiVideoPerMin: 0.02,
    falImage: 0.005,
    falVideo: 0.25,
    gpuEmbed: 0.0005,
    gpuTrackPerMin: 0.03,
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Deep-merge a stored (possibly partial or stale) row over the defaults. */
export function mergeAutoClipAiConfig(stored: unknown): AutoClipAiConfig {
  const d = AUTOCLIP_AI_DEFAULTS;
  if (!isObj(stored)) return structuredClone(d);
  const out = structuredClone(d);

  if (isObj(stored.features)) {
    for (const f of AI_FEATURES) {
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
    if (isObj(b.providers)) {
      for (const p of BROLL_PROVIDERS) if (typeof b.providers[p] === "boolean") out.broll.providers[p] = b.providers[p] as boolean;
    }
    if (b.ranker === "gemini" || b.ranker === "embedding") out.broll.ranker = b.ranker;
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
    out.broll.threshold = num(b.threshold, 0, 100, d.broll.threshold);
    out.broll.libraryBonus = num(b.libraryBonus, 0, 50, d.broll.libraryBonus);
    out.broll.candidatesPerProvider = Math.round(num(b.candidatesPerProvider, 1, 20, d.broll.candidatesPerProvider));
    out.broll.maxGeneratedPerClip = Math.round(num(b.maxGeneratedPerClip, 0, 3, d.broll.maxGeneratedPerClip));
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
