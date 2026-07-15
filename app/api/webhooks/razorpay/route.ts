import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fulfillPayment, type FulfillNotes } from "@/lib/fulfillment";
import { env } from "@/lib/env";

// Backup fulfillment path. The primary path is the client-side verify endpoint
// (app/api/billing/verify); this webhook catches payments where the browser
// closed before verifying. Both share the same idempotent fulfillPayment(), so
// whichever runs first grants and the other no-ops.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("x-razorpay-signature");

  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  // Verify HMAC-SHA256 signature of the raw body.
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: {
      payment?: { entity: { id: string; order_id: string; amount: number; notes: FulfillNotes } };
      refund?: { entity: { id: string; payment_id: string; amount: number } };
    };
  };

  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    if (entity?.id) {
      await fulfillPayment({
        paymentId: entity.id,
        orderId: entity.order_id ?? null,
        amountInPaise: entity.amount ?? 0,
        notes: entity.notes,
        eventName: event.event,
      });
    }
  }

  // Refund issued in the Razorpay dashboard → mirror it here (mark purchase
  // refunded + claw back granted credits). Purchase.id IS the payment id, and
  // refundPurchase is idempotent (already-refunded → no-op), so admin-panel
  // refunds and dashboard refunds can't double-apply.
  if (event.event === "refund.processed" || event.event === "payment.refunded") {
    const paymentId = event.payload?.refund?.entity?.payment_id ?? event.payload?.payment?.entity?.id;
    if (paymentId) {
      const { refundPurchase } = await import("@/lib/admin/billing");
      await refundPurchase({
        purchaseId: paymentId,
        actorId: "system:razorpay-webhook",
        reason: `Razorpay ${event.event}`,
        clawbackCredits: true,
      }).catch(() => {
        /* unknown payment id (e.g. refund of a non-fulfilled payment) — nothing to record */
      });
    }
  }

  return NextResponse.json({ received: true });
}
