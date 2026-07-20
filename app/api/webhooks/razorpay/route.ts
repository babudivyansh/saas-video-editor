import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fulfillPayment, fulfillSubscriptionCharge, type FulfillNotes } from "@/lib/fulfillment";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits";
import { logger } from "@/lib/logger";
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
      payment?: { entity: { id: string; order_id: string; amount: number; notes: FulfillNotes; invoice_id?: string | null } };
      refund?: { entity: { id: string; payment_id: string; amount: number } };
      subscription?: { entity: { id: string; notes?: { userId?: string; planId?: string; trial?: string } } };
    };
  };

  // Subscription lifecycle events (recurring flow) — handled before
  // payment.captured so a subscription-invoice payment doesn't also get
  // routed to the one-time fulfillPayment path below (double grant guard).
  if (event.event === "subscription.activated") {
    const sub = event.payload?.subscription?.entity;
    const userId = sub?.notes?.userId;
    const planSlug = sub?.notes?.planId;
    const isTrial = sub?.notes?.trial === "1";
    if (sub?.id && userId && planSlug) {
      const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { trialUsedAt: true } });
      if (plan && user) {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + 7); // covers the trial window; extended for real on first charge
        // Trial grant: exactly 25 credits, once per account, hard-capped —
        // it does NOT establish a subscription bucket base for rollover.
        const grantTrial = isTrial && !user.trialUsedAt;
        await prisma.user.update({
          where: { id: userId },
          data: {
            planId: plan.id,
            razorpaySubscriptionId: sub.id,
            monthlyCredits: plan.monthlyCredits ?? plan.credits,
            subscriptionEndsAt: endsAt,
            nextRefillAt: null,
            ...(grantTrial ? { trialUsedAt: new Date(), trialEndsAt: endsAt } : {}),
          },
        }).catch((e) => logger.error("webhook", "subscription.activated update failed", e));
        if (grantTrial) {
          await grantCredits({
            userId, bucket: "subscription", amount: 25,
            reason: "grant:trial", refId: sub.id,
          }).catch((e) => logger.error("webhook", "trial grant failed", e));
        }
      }
    }
  }

  if (event.event === "subscription.charged") {
    const paymentEntity = event.payload?.payment?.entity;
    const subEntity = event.payload?.subscription?.entity;
    if (paymentEntity?.id && subEntity?.id) {
      await fulfillSubscriptionCharge({
        subscriptionId: subEntity.id,
        paymentId: paymentEntity.id,
        amountInPaise: paymentEntity.amount ?? 0,
        eventName: event.event,
      });
    }
    return NextResponse.json({ received: true });
  }

  if (
    event.event === "subscription.halted" ||
    event.event === "subscription.cancelled" ||
    event.event === "subscription.completed"
  ) {
    const sub = event.payload?.subscription?.entity;
    // Record-only: don't zero credits immediately. The refill cron's lapse
    // step zeroes the subscription bucket once subscriptionEndsAt passes —
    // this gives a grace period instead of an abrupt cutoff on a webhook.
    if (sub?.id) {
      logger.info("webhook", `subscription ${sub.id} -> ${event.event}`);
    }
    return NextResponse.json({ received: true });
  }

  if (event.event === "payment.captured") {
    const entity = event.payload?.payment?.entity;
    // Skip payments that belong to a subscription invoice — those are
    // handled by subscription.charged above; routing them through
    // fulfillPayment too would double-grant.
    if (entity?.id && !entity.invoice_id) {
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
