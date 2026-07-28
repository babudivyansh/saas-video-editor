import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { fulfillPayment, fulfillSubscriptionCharge, type FulfillNotes } from "@/lib/fulfillment";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { evaluatePromptTrigger, recordPrompt } from "@/lib/reviews/prompt-triggers";
import { notify } from "@/lib/notify";
import { shouldSendCategory } from "@/lib/notifications";
import { sendReviewPromptEmail } from "@/lib/email";

// No browser context here — mirrors the days_active cron's pattern exactly
// (in-app notification + gated email) rather than trying to pop a live
// modal. Only fires for a genuinely NEW charge (fulfilled === true), never a
// webhook redelivery of an already-processed one. Failures are swallowed —
// this is a nice-to-have nudge, never allowed to affect payment handling.
async function maybePromptAfterBillingSuccess(userId: string | undefined) {
  if (!userId) return;
  try {
    const result = await evaluatePromptTrigger(userId, "billing_success");
    if (!result.shouldPrompt) return;
    await recordPrompt(userId, "billing_success", "billing");
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, firstName: true, name: true } });
    if (!user) return;
    await notify({ userId, type: "review_prompt", title: "Got a minute to review Clipiro?", body: "Your feedback helps other creators decide.", href: "/dashboard?prompt=1" });
    if (await shouldSendCategory(userId, "reviewPrompts")) {
      await sendReviewPromptEmail(user.email, user.name ?? user.firstName ?? "there", "https://clipiro.com/dashboard?prompt=1").catch((e) => logger.warn("webhook", "review prompt email failed", e));
    }
  } catch (e) {
    logger.warn("webhook", "review prompt after billing success failed", e);
  }
}

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
            // A fresh/renewed subscription supersedes any prior cancel-at-cycle-end
            // request (e.g. the user re-subscribed after cancelling).
            subscriptionCancelledAt: null,
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
      const result = await fulfillSubscriptionCharge({
        subscriptionId: subEntity.id,
        paymentId: paymentEntity.id,
        amountInPaise: paymentEntity.amount ?? 0,
        eventName: event.event,
      });
      if (result.fulfilled) await maybePromptAfterBillingSuccess(subEntity.notes?.userId);
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
      const result = await fulfillPayment({
        paymentId: entity.id,
        orderId: entity.order_id ?? null,
        amountInPaise: entity.amount ?? 0,
        notes: entity.notes,
        eventName: event.event,
      });
      if (result.fulfilled) await maybePromptAfterBillingSuccess(entity.notes?.userId);
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
