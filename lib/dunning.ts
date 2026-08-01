import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/notify";
import { shouldSendCategory } from "@/lib/notifications";
import { sendPaymentFailedEmail } from "@/lib/email";

// Dunning: what happens between a card being declined and a subscription
// actually ending.
//
// Before this existed, Razorpay's payment.failed and subscription.pending were
// unsubscribed and subscription.halted was log-only, so a failing subscription
// left no trace anywhere. The customer kept working (a successful charge sets
// the term to one month plus three days, and the refill cron then waits
// further), the billing page still read "Renews in N days", and the first
// signal to anyone was access disappearing.
//
// Deliberately conservative: nothing here revokes access or zeroes credits.
// That stays with the refill cron's lapse step, which now also cancels the
// mandate. This module's whole job is to record what happened and tell the
// person whose card it was.

/** Don't re-email on every retry — Razorpay can retry a failed charge several
 * times over days, and each one fires a webhook. */
const FAILURE_EMAIL_COOLDOWN_HOURS = 24;

/** Locate the subscription's owner, tolerating a lost local link. */
async function findOwner(subscriptionId: string, notesUserId?: string) {
  const bySub = await prisma.user.findUnique({
    where: { razorpaySubscriptionId: subscriptionId },
    select: { id: true, email: true, firstName: true, name: true, paymentFailedEmailSentAt: true, paymentFailureCount: true },
  });
  if (bySub) return bySub;
  if (!notesUserId) return null;
  // Same recovery as fulfillSubscriptionCharge: the link can be missing if the
  // account was lapsed locally while a renewal was still being retried.
  return prisma.user.findUnique({
    where: { id: notesUserId },
    select: { id: true, email: true, firstName: true, name: true, paymentFailedEmailSentAt: true, paymentFailureCount: true },
  });
}

export async function recordSubscriptionFailure(args: {
  subscriptionId: string;
  notesUserId?: string;
  type: "payment_failed" | "pending";
  reason: string | null;
}): Promise<void> {
  const { subscriptionId, notesUserId, type, reason } = args;
  const user = await findOwner(subscriptionId, notesUserId);
  if (!user) {
    logger.warn("dunning", `${type} for unknown subscription ${subscriptionId}`);
    return;
  }

  await prisma.subscriptionEvent.create({
    data: { userId: user.id, subscriptionId, type, reason },
  });

  const now = new Date();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      paymentFailedAt: now,
      paymentFailureCount: { increment: 1 },
    },
    select: { paymentFailureCount: true },
  });

  // In-app first: it's the signal that survives a spam folder, and the billing
  // page reads it to show the "update your card" banner.
  await notify({
    userId: user.id,
    type: "billing_payment_failed",
    title: "Your payment didn't go through",
    body: reason
      ? `We couldn't charge your card: ${reason}. Your plan stays active for now — please update your payment method.`
      : "We couldn't charge your card. Your plan stays active for now — please update your payment method.",
    href: "/dashboard?billing=1",
  }).catch((e) => logger.error("dunning", "in-app notify failed", e));

  const lastEmail = user.paymentFailedEmailSentAt;
  const cooledDown =
    !lastEmail || now.getTime() - lastEmail.getTime() > FAILURE_EMAIL_COOLDOWN_HOURS * 3600_000;
  if (!cooledDown) return;

  // Payment failure is a transactional message about money, not marketing —
  // but it is still routed through the preference check so a user who has
  // switched off billing alerts isn't overridden.
  const allowed = await shouldSendCategory(user.id, "creditAlerts").catch(() => true);
  if (!allowed) return;

  await prisma.user.update({ where: { id: user.id }, data: { paymentFailedEmailSentAt: now } });
  await sendPaymentFailedEmail(
    user.email,
    user.firstName ?? user.name ?? "",
    reason,
    updated.paymentFailureCount,
  ).catch((e) => logger.error("dunning", `payment-failed email failed for ${user.id}`, e));
}

export async function recordSubscriptionLifecycle(args: {
  subscriptionId: string;
  notesUserId?: string;
  type: string;
}): Promise<void> {
  const { subscriptionId, notesUserId, type } = args;
  const user = await findOwner(subscriptionId, notesUserId);
  if (!user) {
    logger.warn("dunning", `${type} for unknown subscription ${subscriptionId}`);
    return;
  }

  await prisma.subscriptionEvent.create({
    data: { userId: user.id, subscriptionId, type },
  });

  // A halt is Razorpay giving up on the retries — the point at which the
  // customer genuinely needs to act, so it gets its own in-app notice.
  if (type === "halted") {
    await notify({
      userId: user.id,
      type: "billing_subscription_halted",
      title: "Your subscription is paused",
      body: "We couldn't collect your latest payment after several attempts. Choose a plan to restart — your credits are unaffected.",
      href: "/dashboard?billing=1",
    }).catch((e) => logger.error("dunning", "halt notify failed", e));
  }
}

/** Clear dunning state after a charge succeeds. */
export async function clearPaymentFailure(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { paymentFailedAt: null, paymentFailureCount: 0, paymentFailedEmailSentAt: null },
  }).catch((e) => logger.error("dunning", `could not clear failure state for ${userId}`, e));
}
