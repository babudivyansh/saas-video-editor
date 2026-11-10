import type { TierId } from "@/lib/plans/tiers";
import {
  EDIT_MODELS, INPAINT_MODEL, UPSCALE_MODEL, REMOVE_BG_MODEL, MAX_VARIATIONS, DEFAULT_EDIT_MODEL_ID,
  getEditModel, type EditModelEntry,
} from "@/lib/models/editModels";

// What a Photo Edit request costs, from the request alone. Shared by the route
// (which charges it) and the workspace (which shows it on the Edit button), so
// the quoted and charged numbers can't drift. No server imports.

export type PhotoEditAction = "edit" | "erase" | "expand" | "upscale" | "remove-bg";
export const PHOTO_EDIT_ACTIONS: readonly PhotoEditAction[] = ["edit", "erase", "expand", "upscale", "remove-bg"];

export interface QuoteInput {
  action: PhotoEditAction;
  /** "auto" or an edit model id; only read for action "edit". */
  model?: string;
  variations?: number;
  hiRes?: boolean;
  upscaleFactor?: 2 | 4;
}

export interface Quote {
  /** The model id billed (for "auto", the price Auto always charges). */
  modelId: string;
  creditsPerImage: number;
  costUsdPerImage: number;
  images: number;
  credits: number;
  costUsd: number;
  allowedTiers: readonly TierId[];
}

export function clampVariations(v: unknown): number {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 1;
  return Math.min(MAX_VARIATIONS, Math.max(1, n));
}

/** Auto only ever routes to base-price models, so this is what Auto costs. */
export const AUTO_PRICE_MODEL: EditModelEntry = getEditModel(DEFAULT_EDIT_MODEL_ID)!;

export function quote(q: QuoteInput): Quote | null {
  const multi = q.action === "edit" || q.action === "erase" || q.action === "expand";
  const images = multi ? clampVariations(q.variations) : 1;
  const build = (modelId: string, credits: number, cost: number, tiers: readonly TierId[]): Quote => ({
    modelId, creditsPerImage: credits, costUsdPerImage: cost, images,
    credits: credits * images, costUsd: cost * images, allowedTiers: tiers,
  });

  switch (q.action) {
    case "edit": {
      if (!q.model || q.model === "auto") {
        return build("auto", AUTO_PRICE_MODEL.creditCost, AUTO_PRICE_MODEL.costUsd, AUTO_PRICE_MODEL.allowedTiers);
      }
      const m = getEditModel(q.model);
      if (!m) return null;
      const hi = q.hiRes && m.hiRes ? m.hiRes : null;
      return build(m.id, hi?.creditCost ?? m.creditCost, hi?.costUsd ?? m.costUsd, m.allowedTiers);
    }
    case "erase":
    case "expand":
      return build(INPAINT_MODEL.id, INPAINT_MODEL.creditCost, INPAINT_MODEL.costUsd, INPAINT_MODEL.allowedTiers);
    case "upscale": {
      const f = q.upscaleFactor === 4 ? 4 : 2;
      return build(UPSCALE_MODEL.id, UPSCALE_MODEL.creditCost[f], UPSCALE_MODEL.costUsd[f], UPSCALE_MODEL.allowedTiers);
    }
    case "remove-bg":
      return build(REMOVE_BG_MODEL.id, REMOVE_BG_MODEL.creditCost, REMOVE_BG_MODEL.costUsd, REMOVE_BG_MODEL.allowedTiers);
  }
}

/** Every auto-eligible model this tier may use. */
export function autoModelsForTier(allowed: (m: EditModelEntry) => boolean): string[] {
  return EDIT_MODELS.filter((m) => m.autoEligible && allowed(m)).map((m) => m.id);
}

/** Free plan: edits a day, on top of credits (spec decision Q2). */
export const FREE_DAILY_EDITS = 10;
