import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { sendSubscriptionCancelledEmail } from "@/lib/email";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// Cancels auto-renewal for the caller's active subscription (cancel-at-cycle-end).
// Access continues until subscriptionEndsAt regardless — this stops the NEXT
// charge, it never revokes current access. Idempotent: cancelling an
// already-cancelled subscription just returns the current state.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { subscriptionEndsAt: true, razorpaySubscriptionId: true, subscriptionCancelledAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const hasActivePlan = !!user.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
  if (!hasActivePlan) {
    return NextResponse.json({ error: "No active subscription to cancel" }, { status: 400 });
  }

  if (user.subscriptionCancelledAt) {
    return NextResponse.json({ subscriptionCancelledAt: user.subscriptionCancelledAt, subscriptionEndsAt: user.subscriptionEndsAt });
  }

  // Recurring (Razorpay Subscriptions) plans need an explicit API call to stop
  // the next auto-charge. Legacy prepaid terms (no razorpaySubscriptionId)
  // never auto-charge — the term just lapses at subscriptionEndsAt via the
  // refill-credits cron — so there's nothing to call Razorpay for; marking
  // subscriptionCancelledAt below is purely informational for those.
  if (user.razorpaySubscriptionId) {
    try {
      await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, true);
    } catch (e) {
      logger.error("billing/cancel", `Razorpay cancel failed for sub ${user.razorpaySubscriptionId}`, e);
      return NextResponse.json({ error: "Couldn't reach the payment provider — please try again." }, { status: 502 });
    }
  }

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data: { subscriptionCancelledAt: new Date() },
    select: { subscriptionCancelledAt: true, subscriptionEndsAt: true, email: true, firstName: true, name: true },
  });

  if (user.razorpaySubscriptionId) {
    await prisma.subscriptionEvent.create({
      data: { userId: auth.userId, subscriptionId: user.razorpaySubscriptionId, type: "cancelled", reason: "user_requested" },
    }).catch(() => {});
  }

  // Cancelling produced no confirmation of any kind before — no email, no
  // in-app record — so a user had nothing to show for the request and no
  // reassurance about how long their access lasts.
  sendSubscriptionCancelledEmail(
    updated.email,
    updated.firstName ?? updated.name ?? "",
    updated.subscriptionEndsAt,
  ).catch((e) => logger.error("billing/cancel", `cancellation email failed for ${auth.userId}`, e));

  return NextResponse.json({
    subscriptionCancelledAt: updated.subscriptionCancelledAt,
    subscriptionEndsAt: updated.subscriptionEndsAt,
  });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "billing:cancel" });
