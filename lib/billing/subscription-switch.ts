import { createRazorpay } from "@/lib/billing/razorpay-client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseCurrency } from "@/lib/currency-shared";

const razorpay = createRazorpay();

export type SubscriptionSwitchResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// Retires a Razorpay subscription that has been superseded, immediately (not
// at-cycle-end). Without this, the subscription.activated webhook overwrites
// user.razorpaySubscriptionId with the new id — the old subscription's id is
// permanently dropped from the DB while it keeps auto-charging at Razorpay on
// its own schedule, with nothing in the app pointing at it anymore. Immediate
// (not cycle-end) cancellation is deliberate: the new subscription starts
// billing today, so leaving the old one to bill through its own cycle end is
// exactly the double-billing bug this closes. This is a cutover, not a refund
// — unused PAID time on the old plan is credited separately, as Clip Minutes
// (switchCreditFor below), not refunded.
//
// Two callers, both AFTER the point of no return:
//   - the subscription.activated webhook, once the replacement is genuinely
//     live. Checkout used to call this before creating the new subscription,
//     which meant a customer who abandoned the Razorpay modal lost the
//     subscription they already had, with subscriptionCancelledAt unset so the
//     billing UI still promised a renewal.
//   - PATCH /api/admin/users/[id], when an admin clears a user's plan.
// Also used by lib/billing/trial.ts to kill a trial subscription that turns
// out to be ineligible before it can reach its first charge.
export async function cancelExistingSubscriptionForSwitch(
  userId: string,
  existingRazorpaySubscriptionId: string | null,
  reason = "plan_switch",
): Promise<SubscriptionSwitchResult> {
  if (!existingRazorpaySubscriptionId) return { ok: true };

  try {
    await razorpay.subscriptions.cancel(existingRazorpaySubscriptionId, false);
  } catch (e) {
    logger.error(
      "billing/subscription-switch",
      `Razorpay cancel failed for sub ${existingRazorpaySubscriptionId}`,
      e,
    );
    return {
      ok: false,
      error: "Couldn't switch plans right now — please try again.",
      status: 502,
    };
  }

  await prisma.subscriptionEvent
    .create({
      data: {
        userId,
        subscriptionId: existingRazorpaySubscriptionId,
        type: "cancelled",
        reason,
      },
    })
    .catch(() => {});

  return { ok: true };
}

// ── Credit for unused paid time (2026-10-30) ────────────────────────────────
// A switch starts a fresh term on the new plan. Before this, the months a
// customer had already paid for on the old plan were simply lost — a Creator
// yearly customer upgrading in month 3 forfeited ~₹6,700. Razorpay can't
// discount a subscription's first charge, so the unused value is credited in
// kind instead: never-expiring purchased Clip Minutes, at the 300-minute
// pack's per-minute price (the middle pack — never cheaper than a plan).
//
// "Unused" counts only the monthly refills not yet delivered. The current
// month's grant is already in the customer's balance and comes with them, so
// counting it again would pay it twice; a monthly plan therefore earns 0.

/** The pack whose per-minute price values switch credit. */
export const SWITCH_CREDIT_PACK_SLUG = "minutes_300";

export interface SwitchCredit {
  minutes: number;
  /** Ledger refId — one credit per superseded subscription or term. */
  refId: string;
  monthsLeft: number;
}

/** Whole calendar months from `from` to `to` (floored, never negative). */
export function wholeMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

/** Paid monthly refills still owed on a term that started at `termStart`. */
export function unrefilledMonths(intervalMonths: number, termStart: Date, now: Date): number {
  if (intervalMonths <= 1) return 0;
  // The first refill lands at purchase, then one each month after it.
  const delivered = Math.min(intervalMonths, wholeMonthsBetween(termStart, now) + 1);
  return Math.max(0, intervalMonths - delivered);
}

/**
 * What a switch away from the user's CURRENT plan is worth, or null when it is
 * worth nothing (no live paid term, a monthly plan, or no purchase on record).
 * Read-only: the caller grants it inside its own transaction.
 */
export async function switchCreditFor(userId: string, now = new Date()): Promise<SwitchCredit | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planId: true, subscriptionEndsAt: true, razorpaySubscriptionId: true, trialEndsAt: true },
  });
  if (!user?.planId || !user.subscriptionEndsAt || user.subscriptionEndsAt <= now) return null;
  if (user.trialEndsAt && user.trialEndsAt > now) return null; // a trial was never paid for

  const [plan, purchase, pack] = await Promise.all([
    prisma.plan.findUnique({ where: { id: user.planId }, select: { intervalMonths: true, kind: true } }),
    prisma.purchase.findFirst({
      where: { userId, planId: user.planId, status: "captured" },
      orderBy: { createdAt: "desc" },
      select: { id: true, amountInPaise: true, currency: true, createdAt: true },
    }),
    prisma.plan.findUnique({ where: { slug: SWITCH_CREDIT_PACK_SLUG }, select: { slug: true, priceInPaise: true, minutes: true } }),
  ]);
  if (!plan || plan.kind !== "subscription" || !purchase || !pack || pack.minutes <= 0) return null;

  const interval = plan.intervalMonths ?? 1;
  const monthsLeft = unrefilledMonths(interval, purchase.createdAt, now);
  if (monthsLeft === 0) return null;

  const unusedMinor = (purchase.amountInPaise * monthsLeft) / interval;
  const { getPlanPriceMinor } = await import("@/lib/currency");
  const currency = parseCurrency(purchase.currency) ?? "INR";
  const packMinor = await getPlanPriceMinor(pack.slug, pack.priceInPaise, currency);
  const minutes = Math.floor((unusedMinor / packMinor) * pack.minutes);
  if (minutes <= 0) return null;
  return { minutes, monthsLeft, refId: `switch-credit:${user.razorpaySubscriptionId ?? purchase.id}` };
}
