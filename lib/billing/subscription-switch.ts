import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

export type SubscriptionSwitchResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

// Before checkout starts a new Razorpay subscription for a user who already
// has one, the old one must be cancelled immediately (not at-cycle-end).
// Without this, the webhook's subscription.activated handler unconditionally
// overwrites user.razorpaySubscriptionId with the new id the moment it
// activates — the old subscription's id is permanently dropped from the DB
// while it keeps auto-charging at Razorpay on its own schedule, with nothing
// in the app pointing at it anymore. Immediate (not cycle-end) cancellation
// is deliberate: the new subscription starts billing today, so leaving the
// old one to bill through its own cycle end is exactly the double-billing
// bug this closes. This is a plan-switch cutover, not a refund — the caller
// is responsible for telling the user upfront that unused time on the old
// plan isn't credited or refunded.
export async function cancelExistingSubscriptionForSwitch(
  userId: string,
  existingRazorpaySubscriptionId: string | null,
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
        reason: "plan_switch",
      },
    })
    .catch(() => {});

  return { ok: true };
}
