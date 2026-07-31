import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Razorpay from "razorpay";
import { getAuthUser } from "@/lib/auth";
import { fulfillPayment, type FulfillNotes } from "@/lib/fulfillment";
import { env } from "@/lib/env";
import { withRateLimit } from "@/lib/with-rate-limit";

const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

// Client-callback verification. The Razorpay checkout `handler` posts the
// payment id/order id/signature here on success; we verify the signature and
// fulfill the order server-side — independent of the (unreliable) webhook.
async function handlePOST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const paymentId: string | undefined = body.razorpay_payment_id;
  const orderId: string | undefined = body.razorpay_order_id;
  const signature: string | undefined = body.razorpay_signature;

  if (!paymentId || !orderId || !signature) {
    return NextResponse.json({ error: "Missing payment fields" }, { status: 400 });
  }

  // Verify the checkout signature: HMAC_SHA256(order_id + "|" + payment_id).
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: "Invalid payment signature" }, { status: 400 });
  }

  // Read the trusted order notes (set by /api/billing/checkout) from Razorpay.
  let order: { notes?: FulfillNotes; amount?: number; amount_paid?: number };
  try {
    order = (await razorpay.orders.fetch(orderId)) as typeof order;
  } catch {
    return NextResponse.json({ error: "Could not verify the order. Please refresh." }, { status: 502 });
  }

  const notes = order.notes;
  if (notes?.userId && notes.userId !== auth.userId) {
    return NextResponse.json({ error: "This order belongs to another account." }, { status: 403 });
  }

  const amountInPaise = order.amount_paid ?? order.amount ?? 0;
  const result = await fulfillPayment({ paymentId, orderId, amountInPaise, notes });

  return NextResponse.json({ success: true, fulfilled: result.fulfilled, alreadyProcessed: result.alreadyProcessed });
}

// Each call fetches the order from Razorpay. Generous enough for legitimate
// retries after a flaky network, tight enough to bound provider calls.
export const POST = withRateLimit(handlePOST, { limit: 30, windowSec: 60, keyBy: "user", name: "billing:verify" });
