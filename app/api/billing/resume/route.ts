import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { prisma } from "@/lib/prisma";

// Undoes a pending cancel-at-cycle-end, where that is actually possible.
//
// It is possible for legacy prepaid terms: those never auto-charge (the term
// simply lapses via the refill-credits cron), so subscriptionCancelledAt is
// purely informational and clearing it genuinely restores the prior state.
//
// It is NOT possible for a recurring Razorpay Subscription. Razorpay has no
// "un-cancel": once cancel_at_cycle_end is set the subscription is on its way
// to `cancelled`, and pause/resume is a different state machine that does not
// reverse it. Clearing the local flag would tell the user auto-renewal is back
// on while the mandate was still scheduled to stop — they would discover the
// lie only when their access ended. So we refuse, and tell the client to send
// them to plan selection instead.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { subscriptionEndsAt: true, razorpaySubscriptionId: true, subscriptionCancelledAt: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.subscriptionCancelledAt) {
    // Already renewing — idempotent, same shape as the success case.
    return NextResponse.json({
      subscriptionCancelledAt: null,
      subscriptionEndsAt: user.subscriptionEndsAt,
    });
  }

  const stillInTerm = !!user.subscriptionEndsAt && user.subscriptionEndsAt > new Date();
  if (!stillInTerm) {
    return NextResponse.json(
      { error: "This subscription has already ended. Choose a plan to start a new one.", requiresNewSubscription: true },
      { status: 409 },
    );
  }

  if (user.razorpaySubscriptionId) {
    return NextResponse.json(
      {
        error: "Auto-renewal can't be switched back on once it's cancelled. Choose a plan to start a new subscription — your current access and credits are unaffected until the term ends.",
        requiresNewSubscription: true,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: auth.userId },
    data: { subscriptionCancelledAt: null },
    select: { subscriptionCancelledAt: true, subscriptionEndsAt: true },
  });

  return NextResponse.json(updated);
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "billing:resume" });
