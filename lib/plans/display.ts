import {
  PURCHASABLE_TIER_ORDER, type TierId,
  TIER_MAX_AUTOCLIP_SOURCE_SECONDS, STORAGE_LIMIT_GB,
} from "@/lib/plans/tiers";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
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
  kind: "subscription" | "pack" | "addon" | "minute_pack";
  intervalMonths: number | null;
  monthlyCredits: number | null;
  /** Clip Minutes per month (subscriptions). */
  monthlyMinutes?: number | null;
  /** Clip Minutes a minute pack grants. */
  minutes?: number;
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

/** One-line "who is this for" under each tier name on the plan cards. */
export const TIER_TAGLINE: Record<TierId, string> = {
  free: "Try every tool, no card",
  creator: "For a steady posting habit",
  pro: "Premium models, more output",
  studio: "High volume, fastest queue",
};

/** The same tier's monthly row — what a yearly card strikes through. */
export function monthlyCounterpart(plan: DisplayPlan, subs: DisplayPlan[]): DisplayPlan | null {
  if (!plan.tier || (plan.intervalMonths ?? 1) <= 1) return null;
  return subs.find(p => p.tier === plan.tier && p.intervalMonths === 1) ?? null;
}

const hours = (sec: number) => Math.round(sec / 3600);

export const modelCount = (tier: Exclude<TierId, "free">) =>
  IMAGE_MODELS.filter(m => m.allowedTiers.includes(tier)).length;

/** Image models a tier unlocks that the tier below it doesn't have. */
const addedModels = (tier: Exclude<TierId, "free">, below: Exclude<TierId, "free">) =>
  IMAGE_MODELS.filter(m => m.allowedTiers.includes(tier) && !m.allowedTiers.includes(below)).map(m => m.displayName);

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
  const gb = STORAGE_LIMIT_GB[tier];
  const clipHours = hours(TIER_MAX_AUTOCLIP_SOURCE_SECONDS[tier]);

  if (tier === "creator") {
    return {
      bullets: [
        `Unlimited Auto Clips, ${clipHours}-hour uploads`,
        "No watermark, full-resolution exports",
        // caption-render carries requiredTier: "creator" in lib/tool-costs.ts.
        "Animated captions",
        `${modelCount("creator")} AI image models, incl. Seedream 5.0 & Flux 2`,
        `Social Tracker · ${gb} GB storage`,
      ],
    };
  }

  if (tier === "pro") {
    return {
      inherits: "Creator",
      bullets: [
        `${clipHours}-hour Auto Clip uploads · ${gb} GB storage`,
        // The tools carrying requiredTier: "pro" in lib/tool-costs.ts.
        "Clip Dubbing in 29+ languages",
        "Face Swap & Subtitle Remover",
        `${modelCount("pro")} AI image models — adds ${addedModels("pro", "creator").join(" & ")}`,
        "Priority rendering",
      ],
    };
  }

  // Studio adds exactly one model over Pro (nano-banana-pro is the only entry
  // with allowedTiers: ["studio"]). Everything else it gains is quantitative,
  // so the copy must not imply "more models" beyond that one.
  return {
    inherits: "Pro",
    bullets: [
      "Nano Banana Pro — Studio-only image model",
      "Fastest rendering — front of the queue",
      `${clipHours}-hour Auto Clip uploads`,
      `${gb} GB asset storage`,
    ],
  };
}
