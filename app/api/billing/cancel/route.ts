import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { withRateLimit } from "@/lib/with-rate-limit";
import { cancelSubscriptionForUser } from "@/lib/billing/cancel-subscription";

// Cancels auto-renewal for the caller's active subscription (cancel-at-cycle-end).
// The logic — including the trial special case — lives in
// lib/billing/cancel-subscription.ts, shared with the admin account controls.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await cancelSubscriptionForUser(auth.userId, "user_requested");
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({
    subscriptionCancelledAt: result.subscriptionCancelledAt,
    subscriptionEndsAt: result.subscriptionEndsAt,
  });
}

export const POST = withRateLimit(handlePOST, { limit: 10, windowSec: 60, keyBy: "user", name: "billing:cancel" });
