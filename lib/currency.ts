// Config-driven FX + a tiny USD price book, following the same pattern as
// lib/tool-config.ts / lib/autoclip-pipeline.ts's getAutoClipPricing: a
// Config row admins can edit without a deploy, merged over hardcoded
// defaults. Replaces the hardcoded ₹95/$ comment from the pricing audit.
//
// Scope (2026-07 audit): INR stays the source-of-truth price (priceInPaise
// on Plan); USD is either an explicit override (psychologically anchored,
// e.g. $15/$29/$59) or an FX conversion rounded to .99. Admin pages keep
// showing INR always — this is for the public pricing/billing UI only.

import { prisma } from "@/lib/prisma";
export { formatMoney, inferCurrencyFromLocale, type Currency } from "@/lib/currency-shared";
import type { Currency } from "@/lib/currency-shared";

export interface FxConfig {
  /** INR per 1 USD. Used only for plans without a price_book_usd override. */
  inrPerUsd: number;
}

export const FX_DEFAULTS: FxConfig = { inrPerUsd: 88 };

/** slug -> price in USD cents. Anchors flagship SKUs at clean $X/mo prices
 * instead of a raw FX conversion (e.g. Creator ₹999 -> $15, not $11.35).
 *
 * The yearly rows have to be listed explicitly alongside the monthly ones. If
 * only monthly is anchored, yearly falls through to the FX path below and
 * inherits none of the USD premium — which made the annual discount 49/42/35%
 * in USD against a flat 33% in INR, i.e. US customers buying annual at Indian
 * rates. Each yearly price here is ~33% off 12x its monthly row, so the
 * discount reads the same in both currencies; see lib/currency.test.ts, which
 * fails if a future edit breaks that parity. */
export const USD_PRICE_BOOK_DEFAULTS: Record<string, number> = {
  sub_creator_1mo: 1500,
  sub_pro_1mo: 2900,
  sub_studio_1mo: 5900,
  sub_creator_12mo: 11999, // vs $180 at 12x monthly -> 33% off
  sub_pro_12mo: 23299,     // vs $348 -> 33% off
  sub_studio_12mo: 47399,  // vs $708 -> 33% off
};

async function loadFx(): Promise<FxConfig> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "fx_rates" } });
    if (!row) return FX_DEFAULTS;
    return { ...FX_DEFAULTS, ...(JSON.parse(row.value) as Partial<FxConfig>) };
  } catch {
    return FX_DEFAULTS;
  }
}

async function loadPriceBook(): Promise<Record<string, number>> {
  try {
    const row = await prisma.config.findUnique({ where: { key: "price_book_usd" } });
    if (!row) return USD_PRICE_BOOK_DEFAULTS;
    return { ...USD_PRICE_BOOK_DEFAULTS, ...(JSON.parse(row.value) as Record<string, number>) };
  } catch {
    return USD_PRICE_BOOK_DEFAULTS;
  }
}

export async function getFxConfig(): Promise<FxConfig> {
  return loadFx();
}

export async function getUsdPriceBook(): Promise<Record<string, number>> {
  return loadPriceBook();
}

export async function setFxConfig(patch: Partial<FxConfig>): Promise<FxConfig> {
  const current = await loadFx();
  const next = { ...current, ...patch };
  await prisma.config.upsert({
    where: { key: "fx_rates" },
    update: { value: JSON.stringify(next) },
    create: { key: "fx_rates", value: JSON.stringify(next) },
  });
  return next;
}

export async function setUsdPriceBook(patch: Record<string, number | null>): Promise<Record<string, number>> {
  const current = await loadPriceBook();
  const next = { ...current };
  for (const [slug, cents] of Object.entries(patch)) {
    if (cents == null) delete next[slug];
    else next[slug] = cents;
  }
  await prisma.config.upsert({
    where: { key: "price_book_usd" },
    update: { value: JSON.stringify(next) },
    create: { key: "price_book_usd", value: JSON.stringify(next) },
  });
  return next;
}

/** Convert an INR-paise price to minor units of `currency`. USD: price-book
 * override if present, else FX-converted and rounded to a clean .99. */
export async function getPlanPriceMinor(
  slug: string,
  priceInPaise: number,
  currency: Currency,
): Promise<number> {
  if (currency === "INR") return priceInPaise;
  const book = await loadPriceBook();
  if (book[slug] != null) return book[slug];
  const fx = await loadFx();
  const rawUsd = priceInPaise / 100 / fx.inrPerUsd;
  // Round to the nearest whole dollar minus a cent (…99), floored at $0.99.
  const wholeDollars = Math.max(Math.round(rawUsd), 1);
  return wholeDollars * 100 - 1;
}

