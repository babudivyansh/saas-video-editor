import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { fulfillPayment, fulfillSubscriptionCharge, type FulfillNotes } from "@/lib/fulfillment";
import { recordSubscriptionFailure, recordSubscriptionLifecycle } from "@/lib/dunning";
import { cancelExistingSubscriptionForSwitch } from "@/lib/billing/subscription-switch";
import { prisma } from "@/lib/prisma";
import { grantCredits } from "@/lib/credits";
import { TRIAL_CREDITS } from "@/lib/plans/tiers";
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
      payment?: {
        entity: {
          id: string; order_id: string; amount: number; notes: FulfillNotes;
          invoice_id?: string | null;
          error_description?: string | null;
          error_reason?: string | null;
        };
      };
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
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { trialUsedAt: true, subscriptionEndsAt: true, razorpaySubscriptionId: true },
      });
      if (plan && user) {
        const endsAt = new Date();
        endsAt.setDate(endsAt.getDate() + 7); // covers the trial window; extended for real on first charge
        // Trial grant: exactly TRIAL_CREDITS, once per account, hard-capped —
        // it does NOT establish a subscription bucket base for rollover.
        const grantTrial = isTrial && !user.trialUsedAt;
        // Only ever push the term outwards. A replayed activation arriving
        // after the first real charge would otherwise pull a paid term back to
        // 7 days from today.
        const extendsTerm = !user.subscriptionEndsAt || endsAt > user.subscriptionEndsAt;

        // Plan-switch cutover. Checkout deliberately does NOT cancel the old
        // subscription up front any more (abandoning the payment modal used to
        // destroy a subscription the customer still had), so the old mandate is
        // retired here — the first moment we know the replacement is actually
        // live, and still before the update below drops the old id from the row.
        // A failure is logged rather than fatal: the customer has paid, so
        // withholding their new plan would be the worse outcome. The orphan is
        // recoverable (the id is in the SubscriptionEvent trail and Razorpay's
        // own dashboard); a dropped activation is not.
        if (user.razorpaySubscriptionId && user.razorpaySubscriptionId !== sub.id) {
          const switched = await cancelExistingSubscriptionForSwitch(userId, user.razorpaySubscriptionId);
          if (!switched.ok) {
            logger.error(
              "webhook",
              `activated ${sub.id} for ${userId} but could NOT cancel the superseded subscription ${user.razorpaySubscriptionId} — it may keep charging`,
            );
          }
        }

        // Claim the event and do the work in one transaction. This was the only
        // fulfilment-affecting branch without an idempotency guard — Razorpay
        // retries activations and the signature check has no replay window, so
        // a redelivered body re-ran the whole block. Claiming inside the
        // transaction means a mid-flight failure rolls the claim back and the
        // retry can still succeed, rather than the claim locking out the work.
        try {
          await prisma.$transaction(async (tx) => {
            try {
              await tx.razorpayEvent.create({
                data: { id: `activated:${sub.id}`, event: event.event },
              });
            } catch (e) {
              if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
                return; // already activated — nothing to do
              }
              throw e;
            }

            await tx.user.update({
              where: { id: userId },
              data: {
                planId: plan.id,
                razorpaySubscriptionId: sub.id,
                monthlyCredits: plan.monthlyCredits ?? plan.credits,
                ...(extendsTerm ? { subscriptionEndsAt: endsAt } : {}),
                nextRefillAt: null,
                // Clearing a pending cancel-at-cycle-end is only right when this
                // activation is genuinely a NEW subscription. Doing it
                // unconditionally meant a redelivered webhook silently
                // resurrected a subscription the user had deliberately cancelled.
                ...(user.razorpaySubscriptionId !== sub.id ? { subscriptionCancelledAt: null } : {}),
                ...(grantTrial ? { trialUsedAt: new Date(), trialEndsAt: endsAt } : {}),
              },
            });

            if (grantTrial) {
              await grantCredits({
                userId, bucket: "subscription", amount: TRIAL_CREDITS,
                reason: "grant:trial", refId: sub.id, tx,
              });
            }
          });
        } catch (e) {
          // Signal failure so Razorpay retries. Previously this was swallowed
          // and the route still returned 200, so a lost activation was lost for
          // good — the user paid and never got their plan.
          logger.error("webhook", `subscription.activated failed for ${sub.id}`, e);
          return NextResponse.json({ error: "activation failed" }, { status: 500 });
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
        // Lets fulfilment recover if the local subscription link was lost.
        notesUserId: subEntity.notes?.userId,
        // Lets the first charge grant credits even if it arrives before
        // subscription.activated has written the plan onto the user.
        notesPlanId: subEntity.notes?.planId,
      });
      if (result.fulfilled) await maybePromptAfterBillingSuccess(subEntity.notes?.userId);
    }
    return NextResponse.json({ received: true });
  }

  // ── Dunning ──────────────────────────────────────────────────────────────
  // These used to be log-only (or unsubscribed entirely), so a declined card
  // was invisible: no DB write, no email, no in-app signal, no admin alert.
  // Because a successful charge extends the term by a month plus three days,
  // a halted subscription bought the customer ~33 days of access while the
  // billing page still said "Renews in N days" — and the first anyone knew was
  // when it silently lapsed.
  if (event.event === "payment.failed" || event.event === "subscription.pending") {
    const sub = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;
    const reason = payment?.error_description ?? payment?.error_reason ?? null;
    // payment.failed also fires for one-off pack purchases, which have no
    // subscription and need no dunning — the user simply retries checkout.
    if (sub?.id) {
      await recordSubscriptionFailure({
        subscriptionId: sub.id,
        notesUserId: sub.notes?.userId,
        type: event.event === "payment.failed" ? "payment_failed" : "pending",
        reason,
      }).catch((e) => logger.error("webhook", `dunning record failed for ${sub.id}`, e));
    }
    return NextResponse.json({ received: true });
  }

  if (
    event.event === "subscription.halted" ||
    event.event === "subscription.cancelled" ||
    event.event === "subscription.completed" ||
    event.event === "subscription.paused" ||
    event.event === "subscription.resumed"
  ) {
    const sub = event.payload?.subscription?.entity;
    // Still no immediate credit revocation — the refill cron's lapse step owns
    // that, so a slow retry doesn't cut someone off mid-month. What changed is
    // that the event is now persisted and, for a halt, surfaced to the user.
    if (sub?.id) {
      const type = event.event.replace("subscription.", "");
      await recordSubscriptionLifecycle({
        subscriptionId: sub.id,
        notesUserId: sub.notes?.userId,
        type,
      }).catch((e) => logger.error("webhook", `lifecycle record failed for ${sub.id}`, e));
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
