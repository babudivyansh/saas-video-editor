import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fulfillPayment, type FulfillNotes } from "@/lib/fulfillment";

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
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(body) as {
    event: string;
    payload: { payment: { entity: { id: string; order_id: string; amount: number; notes: FulfillNotes } } };
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

  return NextResponse.json({ received: true });
}
