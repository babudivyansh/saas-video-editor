import {
  PURCHASABLE_TIER_ORDER, type TierId,
  TIER_MAX_DURATION_SECONDS, TIER_MAX_AUTOCLIP_SOURCE_SECONDS, STORAGE_LIMIT_GB,
} from "@/lib/plans/tiers";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";
import type { Currency } from "@/lib/currency-shared";

// Shared plan-display logic for every surface that renders a price card.
//
// /pricing and the billing PlansModal each had their own copy of this maths and
// their own card markup, so a fix to one silently left the other behind: the
// pricing page was rebuilt (derived discount, cumulative tier highlights,
// corrected claims) while the modal a signed-in customer actually buys through
// kept showing a hardcoded 33%, duplicated bullets, and copy that had already
// been found wrong. This module plus components/billing/PlanCard is the single
// definition both now use.

/** The plan shape /api/plans returns. */
export interface DisplayPlan {
  id: string;
  slug: string;
  name: string;
  priceInPaise: number;
  usdPriceInCents: number;
  currency: string;
  credits: number;
  features: string[];
  kind: "subscription" | "pack" | "addon";
  intervalMonths: number | null;
  monthlyCredits: number | null;
  tier: Exclude<TierId, "free"> | null;
}

/** Minor units for the selected currency, from the fields /api/plans always returns. */
export function minorUnits(plan: DisplayPlan, currency: Currency): number {
  return currency === "USD" ? plan.usdPriceInCents : plan.priceInPaise;
}

/**
 * Yearly discount derived from the actual plan rows rather than hardcoded.
 * Plan prices are editable at runtime in /admin/pricing, so a constant drifts
 * from the real saving the moment anyone edits a price.
 *
 * Takes the *smallest* saving across tiers: this figure headlines the term
 * toggle, and every tier has to deliver at least what the badge claims. The
 * tiers can genuinely differ — USD monthly comes from a price book while USD
 * yearly can fall back to FX — so this is not always uniform.
 */
export function yearlySavePct(subs: DisplayPlan[], currency: Currency): number | null {
  const pairs = PURCHASABLE_TIER_ORDER.map(tier => {
    const monthly = subs.find(p => p.tier === tier && p.intervalMonths === 1);
    const yearly = subs.find(p => p.tier === tier && p.intervalMonths === 12);
    if (!monthly || !yearly) return null;
    const full = minorUnits(monthly, currency) * 12;
    if (full <= 0) return null;
    return (full - minorUnits(yearly, currency)) / full;
  }).filter((n): n is number => n != null && n > 0);

  if (pairs.length === 0) return null;
  return Math.round(Math.min(...pairs) * 100);
}

/** This specific plan's saving against 12x its own monthly row. */
export function tierSavePct(plan: DisplayPlan, subs: DisplayPlan[], currency: Currency): number | null {
  const months = plan.intervalMonths ?? 1;
  if (months <= 1 || !plan.tier) return null;
  const monthly = subs.find(p => p.tier === plan.tier && p.intervalMonths === 1);
  if (!monthly) return null;
  const full = minorUnits(monthly, currency) * 12;
  const total = minorUnits(plan, currency);
  if (full <= total) return null;
  return Math.round(((full - total) / full) * 100);
}

const hours = (sec: number) => Math.round(sec / 3600);

export const modelCount = (tier: Exclude<TierId, "free">) =>
  IMAGE_MODELS.filter(m => m.allowedTiers.includes(tier)).length +
  VIDEO_MODELS.filter(m => m.allowedTiers.includes(tier)).length;

/**
 * Cheapest a single video render actually costs at this tier — used for the
 * "≈ N videos" estimate, mirroring the pricing calculator's own maths rather
 * than a flat guess.
 */
export function cheapestVideoCostPerRender(tier: Exclude<TierId, "free">): number | null {
  const models = VIDEO_MODELS.filter(m => m.allowedTiers.includes(tier));
  if (models.length === 0) return null;
  return Math.min(...models.map(m => {
    const dur = typeof m.defaultValues.duration === "number" ? m.defaultValues.duration : m.minDurationSeconds;
    return Math.ceil(m.creditsPerSecond * dur);
  }));
}

/** Cheapest image on any tier — the floor the "≈ N images" estimate uses. */
export const cheapestImageCost = Math.min(...IMAGE_MODELS.map(m => m.creditCost));

export interface TierHighlights {
  /** Shown above the list on Pro/Studio so the tiers read cumulatively. */
  inherits?: string;
  bullets: string[];
}

/**
 * What each tier actually gets, derived from the constants that enforce it so
 * the copy cannot drift from the behaviour.
 *
 * Deliberately NOT read from Plan.features. Those rows are seeded per billing
 * term — the yearly ones only ever held a credits line and a savings line, both
 * of which the card header already renders — and existing databases still carry
 * claims that were found wrong ("1080p exports" undersells every paid tier,
 * since the 720p cap applies only to watermarked free renders; "Dedicated
 * support" has nothing behind it anywhere in the codebase).
 */
export function tierHighlights(tier: Exclude<TierId, "free">): TierHighlights {
  const secs = TIER_MAX_DURATION_SECONDS[tier];
  const gb = STORAGE_LIMIT_GB[tier];
  const clipHours = hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier]);

  if (tier === "creator") {
    return {
      bullets: [
        `${modelCount("creator")} AI models, incl. Wan 2.7 & LTX 2.3`,
        `Videos up to ${secs} seconds`,
        `Unlimited Auto Clips, ${clipHours}-hour uploads`,
        "No watermark, full-resolution exports",
        `Social Tracker · ${gb} GB storage`,
      ],
    };
  }

  if (tier === "pro") {
    const added = modelCount("pro") - modelCount("creator");
    return {
      inherits: "Creator",
      bullets: [
        `${modelCount("pro")} AI models — adds Veo 3, Seedance 2.0 & ${added - 2} more`,
        `Videos up to ${secs} seconds`,
        // The three tools carrying requiredTier: "pro" in lib/tool-costs.ts.
        "AI Creator, Face Swap & Subtitle Remover",
        "Priority rendering",
        `${clipHours}-hour Auto Clip uploads · ${gb} GB storage`,
      ],
    };
  }

  // Studio adds exactly one model over Pro (nano-banana-pro is the only entry
  // in either registry with allowedTiers: ["studio"]). Everything else it gains
  // is quantitative, so the copy must not imply "more models" beyond that one.
  return {
    inherits: "Pro",
    bullets: [
      "Nano Banana Pro — Studio-only image model",
      `Videos up to ${secs} seconds`,
      "Fastest rendering — front of the queue",
      `${clipHours}-hour Auto Clip uploads`,
      `${gb} GB asset storage`,
    ],
  };
}
