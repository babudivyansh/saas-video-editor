import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// Cancels a Razorpay subscription as a side effect of the user leaving the
// account entirely (deactivate or hard-delete) — as opposed to
// app/api/billing/cancel/route.ts, which is the user explicitly asking to
// cancel while staying on the account. Unlike that route (and
// cancelExistingSubscriptionForSwitch), this MUST be best-effort: a Razorpay
// outage must never block a user's own deactivate/delete request, so
// failures are logged (reaching Sentry via logger.error) rather than thrown.
// Cancels at cycle-end (matches the manual Cancel button) rather than
// immediately — the account is going away, but there's no reason to also
// forfeit time already paid for.
export async function cancelRazorpaySubscriptionBestEffort(
  subscriptionId: string,
  userId: string,
  context: "deactivate" | "delete",
): Promise<void> {
  try {
    await razorpay.subscriptions.cancel(subscriptionId, true);
  } catch (e) {
    logger.error(
      "billing/cancel-on-account-lifecycle",
      `Razorpay cancel failed for sub ${subscriptionId} during account ${context} (userId ${userId})`,
      e,
    );
    return;
  }

  // SubscriptionEvent.userId cascades on User delete, so writing one right
  // before hardDeleteUserAccount's transaction removes the user row would be
  // immediately erased — pointless for the "delete" context. Only record it
  // for "deactivate", where the user (and this audit trail) survives.
  if (context === "deactivate") {
    await prisma.subscriptionEvent
      .create({
        data: { userId, subscriptionId, type: "cancelled", reason: "account_deactivate" },
      })
      .catch(() => {});
  }
}
