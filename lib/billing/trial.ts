// The 7-day Pro trial — who gets it, and what happens when it starts.
//
// HOW RAZORPAY RUNS A TRIAL. Checkout creates a subscription with start_at =
// now + 7 days. The customer authorises a ₹5 (auto-refunded) payment, which
// registers the mandate and moves the subscription to `authenticated` —
// firing `subscription.authenticated`. It then SITS in `authenticated` until
// start_at, when Razorpay makes the first real charge and fires
// `subscription.activated` + `subscription.charged` together.
//
// The trial used to be granted on `activated`, i.e. on day 7, at the same
// moment as the first charge: a trial customer got no credits and no Pro
// access for the whole trial, and their "trial" began the day it was billed.
// It is now granted here, on `authenticated`.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { grantCredits } from "@/lib/credits";
import { isTrialPlan, TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/plans/tiers";
import { cancelExistingSubscriptionForSwitch } from "./subscription-switch";
import { sendTrialStartedEmail } from "@/lib/email";
import { trialEligibility, type TrialIneligible } from "./trial-eligibility";

export interface AuthenticatedSubscription {
  id: string;
  /** Unix seconds — when the first real charge (and the paid term) begins. */
  start_at?: number | null;
  notes?: { userId?: string; planId?: string; trial?: string };
}

export type TrialStartResult =
  | { status: "not-a-trial" }
  | { status: "started" }
  | { status: "already-started" }
  | { status: "rejected"; reason: TrialIneligible | "unknown-plan" | "unknown-user" };

/**
 * Handle `subscription.authenticated`. For a trial subscription this is the
 * moment the trial begins: Pro access until start_at, TRIAL_CREDITS once, and
 * the account's one trial marked as used.
 *
 * Eligibility is re-checked here, not trusted from checkout — two checkouts
 * opened in parallel both pass the checkout check. A trial subscription that
 * is no longer eligible is cancelled IMMEDIATELY (cancel_at_cycle_end is
 * refused by Razorpay for an authenticated subscription anyway), so it can
 * never reach its day-7 charge. Throws on a DB failure so the webhook 500s
 * and Razorpay retries.
 */
export async function startTrialOnAuthentication(sub: AuthenticatedSubscription): Promise<TrialStartResult> {
  if (sub.notes?.trial !== "1") return { status: "not-a-trial" };
  const userId = sub.notes.userId;
  const planSlug = sub.notes.planId;

  const [plan, user] = await Promise.all([
    planSlug ? prisma.plan.findUnique({ where: { slug: planSlug } }) : null,
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { razorpaySubscriptionId: true, trialUsedAt: true } }) : null,
  ]);

  // Redelivery of an authentication we already turned into a trial.
  if (user?.razorpaySubscriptionId === sub.id && user.trialUsedAt) return { status: "already-started" };

  const reject = async (reason: Extract<TrialStartResult, { status: "rejected" }>["reason"]): Promise<TrialStartResult> => {
    logger.warn("billing/trial", `rejecting trial subscription ${sub.id} for ${userId ?? "?"}: ${reason}`);
    if (userId) {
      const cancelled = await cancelExistingSubscriptionForSwitch(userId, sub.id, "trial_ineligible");
      if (!cancelled.ok) {
        logger.error("billing/trial", `could NOT cancel ineligible trial ${sub.id} — it will charge on day ${TRIAL_DAYS}`);
      }
    }
    return { status: "rejected", reason };
  };

  if (!userId || !user) return reject("unknown-user");
  if (!plan || !isTrialPlan(plan)) return reject("unknown-plan");
  const ineligible = await trialEligibility(userId);
  if (ineligible) return reject(ineligible);

  const startAt = sub.start_at ? new Date(sub.start_at * 1000) : new Date(Date.now() + TRIAL_DAYS * 86_400_000);
  const now = new Date();

  const claimed = await prisma.$transaction(async (tx) => {
    try {
      await tx.razorpayEvent.create({ data: { id: `authenticated:${sub.id}`, event: "subscription.authenticated" } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        planId: plan.id,
        razorpaySubscriptionId: sub.id,
        monthlyCredits: plan.monthlyCredits ?? plan.credits,
        subscriptionEndsAt: startAt,
        subscriptionCancelledAt: null,
        nextRefillAt: null,
        trialUsedAt: now,
        trialEndsAt: startAt,
      },
    });
    await grantCredits({ userId, bucket: "subscription", amount: TRIAL_CREDITS, reason: "grant:trial", refId: sub.id, tx });
    return true;
  });
  if (!claimed) return { status: "already-started" };

  await prisma.subscriptionEvent
    .create({ data: { userId, subscriptionId: sub.id, type: "trial_started" } })
    .catch(() => {});

  // Tell them plainly what they just agreed to: free until when, then how
  // much. They authorised a mandate while paying ₹0 — the first real charge
  // must never be a surprise. Non-fatal: the trial itself has been granted.
  const recipient = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, name: true } });
  if (recipient) {
    await sendTrialStartedEmail(
      recipient.email, recipient.firstName ?? recipient.name ?? "", plan.name, plan.priceInPaise, TRIAL_CREDITS, startAt,
    ).catch((e: unknown) => logger.error("billing/trial", `trial-started email failed for ${userId}`, e));
  }
  return { status: "started" };
}
