import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendSubscriptionCancelledEmail } from "@/lib/email";
import { greetingName } from "@/lib/display-name";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export type CancelSubscriptionResult =
  | { ok: true; subscriptionCancelledAt: Date | null; subscriptionEndsAt: Date | null }
  | { ok: false; status: 400 | 404 | 502; error: string };

// Cancels auto-renewal for a user's active subscription (cancel-at-cycle-end).
// Access continues until subscriptionEndsAt regardless — this stops the NEXT
// charge, it never revokes current access. Idempotent: cancelling an
// already-cancelled subscription just returns the current state.
//
// Shared by the user's own Cancel button (POST /api/billing/cancel) and the
// admin account controls, so the trial special case below can't diverge.
export async function cancelSubscriptionForUser(
  userId: string,
  reason: "user_requested" | "admin_requested",
): Promise<CancelSubscriptionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionEndsAt: true, razorpaySubscriptionId: true, subscriptionCancelledAt: true, trialEndsAt: true },
  });
  if (!user) return { ok: false, status: 404, error: "User not found" };

  const hasActivePlan = !!user.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
  if (!hasActivePlan) return { ok: false, status: 400, error: "No active subscription to cancel" };

  if (user.subscriptionCancelledAt) {
    return { ok: true, subscriptionCancelledAt: user.subscriptionCancelledAt, subscriptionEndsAt: user.subscriptionEndsAt };
  }

  // Recurring (Razorpay Subscriptions) plans need an explicit API call to stop
  // the next auto-charge. Legacy prepaid terms (no razorpaySubscriptionId)
  // never auto-charge — the term just lapses at subscriptionEndsAt via the
  // refill-credits cron — so there's nothing to call Razorpay for; marking
  // subscriptionCancelledAt below is purely informational for those.
  // Inside the 7-day trial the subscription is still `authenticated` — its
  // first billing cycle hasn't begun — and Razorpay REFUSES cancel-at-cycle-end
  // for it. Cancel it outright instead: nothing has been charged, nothing ever
  // will be, and Pro access still runs to the trial's end (subscriptionEndsAt).
  // Before this, cancelling a trial failed, and the customer was billed on day
  // 7 despite the checkout promise of "Cancel any time before it ends".
  const inTrial = !!user.trialEndsAt && user.trialEndsAt > new Date();

  if (user.razorpaySubscriptionId) {
    try {
      await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, !inTrial);
    } catch (e) {
      logger.error("billing/cancel", `Razorpay cancel failed for sub ${user.razorpaySubscriptionId}`, e);
      return { ok: false, status: 502, error: "Couldn't reach the payment provider — please try again." };
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { subscriptionCancelledAt: new Date() },
    select: { subscriptionCancelledAt: true, subscriptionEndsAt: true, email: true, name: true },
  });

  if (user.razorpaySubscriptionId) {
    await prisma.subscriptionEvent.create({
      data: {
        userId, subscriptionId: user.razorpaySubscriptionId, type: "cancelled",
        reason: inTrial ? `${reason}_trial` : reason,
      },
    }).catch(() => {});
  }

  // Cancelling produced no confirmation of any kind before — no email, no
  // in-app record — so a user had nothing to show for the request and no
  // reassurance about how long their access lasts.
  sendSubscriptionCancelledEmail(
    updated.email,
    greetingName(updated.name),
    updated.subscriptionEndsAt,
  ).catch((e) => logger.error("billing/cancel", `cancellation email failed for ${userId}`, e));

  return { ok: true, subscriptionCancelledAt: updated.subscriptionCancelledAt, subscriptionEndsAt: updated.subscriptionEndsAt };
}
