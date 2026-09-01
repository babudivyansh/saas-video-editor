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

// Retires a Razorpay subscription that has been superseded, immediately (not
// at-cycle-end). Without this, the subscription.activated webhook overwrites
// user.razorpaySubscriptionId with the new id — the old subscription's id is
// permanently dropped from the DB while it keeps auto-charging at Razorpay on
// its own schedule, with nothing in the app pointing at it anymore. Immediate
// (not cycle-end) cancellation is deliberate: the new subscription starts
// billing today, so leaving the old one to bill through its own cycle end is
// exactly the double-billing bug this closes. This is a cutover, not a refund
// — the caller is responsible for telling the user upfront that unused time on
// the old plan isn't credited or refunded.
//
// Two callers, both AFTER the point of no return:
//   - the subscription.activated webhook, once the replacement is genuinely
//     live. Checkout used to call this before creating the new subscription,
//     which meant a customer who abandoned the Razorpay modal lost the
//     subscription they already had, with subscriptionCancelledAt unset so the
//     billing UI still promised a renewal.
//   - PATCH /api/admin/users/[id], when an admin clears a user's plan.
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
