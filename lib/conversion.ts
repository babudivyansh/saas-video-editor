// The conversion plan of 2026-11-26, in one client-safe place: where an
// upgrade offer can be shown, the funnel targets the admin funnel compares
// against, and the ₹199 entry pack.
//
// Why it exists: of 330 users on 2026-11-26, 16% had ever run AutoClip, 1 had
// started a trial and 4 had paid. Almost nobody ran out of free minutes, so
// almost nobody ever saw an upgrade offer, and nothing recorded who looked at
// plans or opened checkout. Every upgrade prompt now names its placement, so
// the funnel can say which ones work.
//
// No server imports: the dashboard, the API and the admin panel all read it.

/** Every surface that offers the trial, a plan or a pack. */
export const UPGRADE_PLACEMENTS = [
  "file_limit",        // a video over the plan's upload size or length
  "low_minutes",       // Home banner when free minutes run low
  "minutes_short",     // a run refused for not enough minutes
  "watermark_banner",  // clips page
  "download_gate",     // first download of a watermarked clip
  "header_pill",       // the minutes pill in the top bar
  "pricing_page",
  "billing_panel",
  "email",             // a CTA in an email (?src=email_<template>)
  "other",
] as const;
export type UpgradePlacement = (typeof UPGRADE_PLACEMENTS)[number];

export function isUpgradePlacement(v: unknown): v is UpgradePlacement {
  return typeof v === "string" && (UPGRADE_PLACEMENTS as readonly string[]).includes(v);
}

/** A ?src= value from an email link, e.g. "email_low_minutes" → "email". */
export function placementFromSource(src: string | null | undefined): UpgradePlacement {
  if (!src) return "other";
  if (src.startsWith("email")) return "email";
  return isUpgradePlacement(src) ? src : "other";
}

/** The ₹199 first pack: 40 Clip Minutes, once per account, and clips made
 *  while it's in use carry no watermark (lib/clip-watermark.ts). Cheaper per
 *  minute than Creator on purpose — it's a first purchase, not a top-up, so
 *  it is capped at one per account (api/billing/checkout). */
export const ENTRY_PACK_SLUG = "minutes_40";
export const ENTRY_PACK_MINUTES = 40;
export const ENTRY_PACK_INR = 199;
export const ENTRY_PACK_USD_CENTS = 299;

/** How long after buying a minute pack a free-plan account's clips stay
 *  watermark-free. */
export const PACK_NO_WATERMARK_DAYS = 30;

/** Free minutes at or under this show the low-minutes trial offer. */
export const LOW_MINUTES_OFFER_AT = 5;

/** Phase 6 targets, shown next to the measured share in Admin → Analytics.
 *  Shares of signups in the window (trial → paid is of trials). Baseline is
 *  the 2026-11-26 snapshot. */
export const CONVERSION_TARGETS = {
  ran_autoclip: { baseline: 16, target: 35 },
  saw_upgrade: { baseline: 2, target: 40 },
  trial: { baseline: 0.3, target: 8 },
  trial_to_paid: { baseline: null, target: 25 },
  paid: { baseline: 1.2, target: 4 },
} as const;
export const CONVERSION_REVIEW_DATE = "2026-12-10";

/** Minute packs to list for this account: the First Pack only until the
 *  account's first purchase (checkout refuses a second one anyway). */
export function listableMinutePacks<T extends { slug: string }>(packs: T[], user: { hasPurchased?: boolean } | null | undefined): T[] {
  return user?.hasPurchased ? packs.filter((p) => p.slug !== ENTRY_PACK_SLUG) : packs;
}
