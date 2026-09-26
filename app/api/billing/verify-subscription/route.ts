import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { withRateLimit } from "@/lib/with-rate-limit";
import { startTrialOnAuthentication, type AuthenticatedSubscription } from "@/lib/billing/trial";

// Constructed on first use: route modules are imported by tests with the
// Razorpay env absent, and the SDK throws at construction without a key.
let client: Razorpay | null = null;
function razorpay(): Razorpay {
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

/**
 * POST /api/billing/verify-subscription
 *
 * The backup path for starting a free trial. The Razorpay checkout `handler`
 * posts {razorpay_payment_id, razorpay_subscription_id, razorpay_signature}
 * here the moment the customer authorises the mandate.
 *
 * Trials used to depend ENTIRELY on the subscription.authenticated webhook.
 * In the first live test the test-mode webhook was missing, then pointed at
 * the homepage: the customer authorised the mandate and got nothing. One-time
 * orders already had this client-side path (/api/billing/verify); now trials do.
 *
 * Safe to race the webhook: both call startTrialOnAuthentication, which claims
 * `authenticated:<subscription id>` in a transaction, so whichever arrives
 * first grants the trial and the other is a no-op.
 *
 * Paid (non-trial) subscriptions are still granted by the activated/charged
 * webhooks; this answers "pending" for them.
 */
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const paymentId: unknown = body?.razorpay_payment_id;
  const subscriptionId: unknown = body?.razorpay_subscription_id;
  const signature: unknown = body?.razorpay_signature;
  if (typeof paymentId !== "string" || typeof subscriptionId !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });
  }

  // Razorpay's subscription signature: HMAC_SHA256(payment_id + "|" + subscription_id).
  const expected = crypto.createHmac("sha256", env.RAZORPAY_KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Trust Razorpay's copy of the subscription, never the request body: its
  // notes (owner, plan, trial flag) were written by our own checkout route.
  let sub: AuthenticatedSubscription & { status?: string };
  try {
    sub = (await razorpay().subscriptions.fetch(subscriptionId)) as unknown as typeof sub;
  } catch (e) {
    logger.error("billing/verify-subscription", `could not fetch ${subscriptionId}`, e);
    return NextResponse.json({ error: "Could not verify the subscription. It will finish shortly." }, { status: 502 });
  }
  if (sub.notes?.userId !== auth.userId) {
    return NextResponse.json({ error: "This subscription belongs to another account." }, { status: 403 });
  }

  if (sub.notes?.trial !== "1") return NextResponse.json({ status: "pending" });
  if (sub.status !== "authenticated" && sub.status !== "active") {
    return NextResponse.json({ status: "pending", subscriptionStatus: sub.status ?? null });
  }

  try {
    const result = await startTrialOnAuthentication(sub);
    return NextResponse.json({ status: result.status, ...(result.status === "rejected" ? { reason: result.reason } : {}) });
  } catch (e) {
    // The webhook remains the fallback; the customer is told it's finishing.
    logger.error("billing/verify-subscription", `trial start failed for ${subscriptionId}`, e);
    return NextResponse.json({ error: "Your trial is being set up. It will appear shortly." }, { status: 500 });
  }
}

// One call per checkout, plus genuine retries after a flaky network.
export const POST = withRateLimit(handlePOST, { limit: 20, windowSec: 60, keyBy: "user", name: "billing:verify-subscription" });
