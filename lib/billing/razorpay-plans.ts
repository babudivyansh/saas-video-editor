// Provisioning + re-provisioning of Razorpay Plans for our subscription rows.
//
// Razorpay Plans are IMMUTABLE: the amount is fixed at creation. Plan.priceInPaise
// is editable at runtime in /admin/pricing, so before this module existed a price
// edit changed what /pricing advertised while every recurring subscriber (and
// every new subscription checkout) kept being charged the old amount, forever,
// with nothing in the admin UI hinting at the divergence. The only sync path was
// scripts/razorpay-sync-plans.ts, which deliberately SKIPS any plan that already
// has an id.
//
// The fix is to mint a NEW Razorpay Plan whenever the price changes and point
// Plan.razorpayPlanId{Inr,Usd} at it. That is also the correct billing
// semantics: subscribers already on the old Razorpay Plan keep the price they
// bought at (Razorpay bills them against their own plan id, which we no longer
// reference), and only new checkouts pick up the new price.

import Razorpay from "razorpay";
import type { Plan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPlanPriceMinor, type Currency } from "@/lib/currency";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export const SYNC_CURRENCIES: readonly Currency[] = ["INR", "USD"];

// Constructed on first use, not at module load: this module is imported by
// route files that unit tests load with the Razorpay env absent, and the SDK
// throws at construction time when key_id is missing.
let client: Razorpay | null = null;
function razorpay(): Razorpay {
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

export const planIdField = (currency: Currency) =>
  currency === "INR" ? ("razorpayPlanIdInr" as const) : ("razorpayPlanIdUsd" as const);

export function storedPlanId(plan: Plan, currency: Currency): string | null {
  return currency === "INR" ? plan.razorpayPlanIdInr : plan.razorpayPlanIdUsd;
}

export type SyncOutcome =
  | { ok: true; currency: Currency; razorpayPlanId: string; created: boolean }
  | { ok: false; currency: Currency; error: string };

/**
 * Ensure `plan` has a Razorpay Plan for `currency` priced at its CURRENT price.
 *
 * `force` mints a replacement even when an id is already stored — that is the
 * price-change path. Without it this is the idempotent provisioning the sync
 * script has always done.
 */
export async function syncRazorpayPlan(
  plan: Plan,
  currency: Currency,
  opts: { force?: boolean } = {},
): Promise<SyncOutcome> {
  if (plan.kind !== "subscription") {
    return { ok: false, currency, error: "Only subscription plans have a Razorpay Plan." };
  }
  if (!plan.intervalMonths) {
    return { ok: false, currency, error: "Plan has no intervalMonths." };
  }

  const existing = storedPlanId(plan, currency);
  if (existing && !opts.force) {
    return { ok: true, currency, razorpayPlanId: existing, created: false };
  }

  // Razorpay Plans are priced per billing cycle; intervalMonths=12 plans still
  // bill monthly in the Subscriptions API (period="monthly", interval=1) with
  // total_count driving the term — but our yearly SKUs are prepaid-annual
  // pricing, so we bill them as period="yearly" to keep the charge cadence
  // matching what the price represents.
  const period = plan.intervalMonths === 1 ? "monthly" : "yearly";

  // Must go through getPlanPriceMinor, not priceInPaise. priceInPaise is INR
  // minor units; sending it with currency:"USD" would create the Creator plan
  // at $999/month instead of $15. This is also the same function the pricing
  // page and checkout use, so the Razorpay Plan amount agrees with the price
  // the customer was shown.
  const amount = await getPlanPriceMinor(plan.slug, plan.priceInPaise, currency);

  let created;
  try {
    created = await razorpay().plans.create({
      period,
      interval: 1,
      item: {
        name: plan.name,
        amount,
        currency,
        description: `Clipiro ${plan.name}`,
      },
      notes: { planSlug: plan.slug },
    });
  } catch (e) {
    logger.error("billing/razorpay-plans", `plans.create failed for ${plan.slug} (${currency})`, e);
    return { ok: false, currency, error: `Razorpay rejected the ${currency} plan. Please try again.` };
  }

  await prisma.plan.update({
    where: { id: plan.id },
    data: { [planIdField(currency)]: created.id },
  });

  return { ok: true, currency, razorpayPlanId: created.id, created: true };
}

/**
 * Re-mint every currency this plan is ALREADY synced for, at its current price.
 *
 * Currencies that were never synced stay unsynced — syncing them here would
 * silently switch a plan onto recurring billing as a side effect of a price
 * edit, which is a separate decision (use the explicit sync endpoint).
 *
 * `previousPriceInPaise` lets this skip currencies whose CHARGED amount didn't
 * actually move. USD is price-book anchored for every subscription SKU
 * (USD_PRICE_BOOK_DEFAULTS), so without this an INR edit would mint a duplicate
 * USD plan at the identical amount on every single save.
 */
export async function resyncPricedCurrencies(
  plan: Plan,
  previousPriceInPaise?: number,
): Promise<SyncOutcome[]> {
  const outcomes: SyncOutcome[] = [];
  for (const currency of SYNC_CURRENCIES) {
    const existing = storedPlanId(plan, currency);
    if (!existing) continue;

    if (previousPriceInPaise !== undefined) {
      const [next, prev] = await Promise.all([
        getPlanPriceMinor(plan.slug, plan.priceInPaise, currency),
        getPlanPriceMinor(plan.slug, previousPriceInPaise, currency),
      ]);
      if (next === prev) {
        outcomes.push({ ok: true, currency, razorpayPlanId: existing, created: false });
        continue;
      }
    }

    outcomes.push(await syncRazorpayPlan(plan, currency, { force: true }));
  }
  return outcomes;
}
