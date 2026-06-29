import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPurchaseConfirmationEmail } from "@/lib/email";

// Single source of truth for granting a captured Razorpay payment. Called by
// BOTH the client-side verify endpoint (app/api/billing/verify) and the webhook
// (app/api/webhooks/razorpay) so whichever arrives first fulfills, and the other
// no-ops. Idempotency is enforced by claiming the RazorpayEvent row first.

export interface FulfillNotes {
  userId?: string;
  planId?: string;   // current field — the plan slug
  packId?: string;   // legacy alias
  addonIds?: string;
  kind?: string;
  credits?: string;
  couponId?: string;
  couponCode?: string;
  discountInPaise?: string;
}

export interface FulfillArgs {
  paymentId: string;
  orderId: string | null;
  amountInPaise: number;
  notes: FulfillNotes | undefined;
  /** The webhook passes its own event name; the verify endpoint passes "payment.captured". */
  eventName?: string;
}

export interface FulfillResult {
  fulfilled: boolean;
  alreadyProcessed: boolean;
}

export async function fulfillPayment(args: FulfillArgs): Promise<FulfillResult> {
  const { paymentId, orderId, amountInPaise, notes } = args;
  if (!paymentId) return { fulfilled: false, alreadyProcessed: false };

  // ── Idempotency claim ──────────────────────────────────────────────────────
  // Create the event row up-front. If it already exists, another path (webhook
  // or verify) already handled this payment — bail out without double-granting.
  try {
    await prisma.razorpayEvent.create({
      data: { id: paymentId, event: args.eventName ?? "payment.captured" },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { fulfilled: false, alreadyProcessed: true };
    }
    throw e;
  }

  const userId = notes?.userId;
  const planSlug = notes?.planId ?? notes?.packId;
  if (!userId || !planSlug) return { fulfilled: false, alreadyProcessed: false };

  // Resolve everything from the DB plan (single source of truth); fall back to
  // the order notes only if the plan was since removed.
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  const kind = plan?.kind ?? notes?.kind ?? "pack";

  if (kind === "subscription" && plan) {
    const months = plan.intervalMonths ?? 1;
    const monthlyCredits = plan.monthlyCredits ?? plan.credits;
    const now = new Date();
    const endsAt = new Date(now); endsAt.setMonth(endsAt.getMonth() + months);
    const nextRefill = new Date(now); nextRefill.setMonth(nextRefill.getMonth() + 1);

    let addonSlugs: string[] = [];
    try { addonSlugs = notes?.addonIds ? JSON.parse(notes.addonIds) : []; } catch { /* ignore */ }

    const addons = addonSlugs.length
      ? await prisma.plan.findMany({ where: { slug: { in: addonSlugs }, kind: "pack" } })
      : [];
    const addonCredits = addons.reduce((s, a) => s + a.credits, 0);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        credits: { increment: monthlyCredits + addonCredits },
        planId: plan.id,
        subscriptionId: orderId,
        subscriptionEndsAt: endsAt,
        nextRefillAt: months > 1 ? nextRefill : null,
        monthlyCredits,
        veo3Enabled: plan.veo3Included,
      },
      select: { credits: true },
    });
    await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);
    await prisma.purchase.create({
      data: { id: paymentId, userId, planId: plan.id, amountInPaise, credits: monthlyCredits + addonCredits, status: "captured" },
    });
  } else if (kind === "addon") {
    await prisma.user.update({ where: { id: userId }, data: { veo3Enabled: true } });
    await prisma.purchase.create({
      data: { id: paymentId, userId, planId: plan?.id ?? null, amountInPaise, credits: 0, status: "captured" },
    });
  } else {
    // One-time top-up pack: just add credits.
    const credits = plan?.credits ?? parseInt(notes?.credits ?? "0", 10);
    if (credits > 0) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
        select: { credits: true },
      });
      await redis.set(`credits:${userId}`, String(user.credits), "EX", 3600);
      await prisma.purchase.create({
        data: { id: paymentId, userId, planId: plan?.id ?? null, amountInPaise, credits, status: "captured" },
      });
    }
  }

  // ── Purchase confirmation email (non-fatal) ───────────────────────────────
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, name: true },
    });
    if (user) {
      const planForEmail = plan ?? await prisma.plan.findUnique({ where: { slug: planSlug } });
      const creditsForEmail = planForEmail?.credits ?? parseInt(notes?.credits ?? "0", 10);
      const isSubscription = (planForEmail?.kind ?? kind) === "subscription";
      await sendPurchaseConfirmationEmail({
        userEmail: user.email,
        userName: user.firstName ?? user.name ?? "",
        planName: planForEmail?.name ?? planSlug ?? "Credit Pack",
        creditsAdded: creditsForEmail,
        amountInPaise,
        orderId: orderId ?? paymentId,
        isSubscription,
      });
    }
  } catch (err) {
    console.error("[fulfillment] purchase confirmation email error", err);
  }

  // ── Coupon redemption (non-fatal) ──────────────────────────────────────────
  if (notes?.couponId) {
    try {
      const discountInPaise = parseInt(notes.discountInPaise ?? "0", 10) || 0;
      await prisma.$transaction([
        prisma.couponRedemption.create({
          data: { couponId: notes.couponId, userId, orderId, discountInPaise },
        }),
        prisma.coupon.update({
          where: { id: notes.couponId },
          data: { timesRedeemed: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      console.error("[fulfillment] coupon redemption error", err);
    }
  }

  // ── Affiliate commission (non-fatal, first payment only) ───────────────────
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: userId },
      include: { affiliate: true },
    });
    if (referral && referral.status === "signed_up" && referral.affiliate.status === "active") {
      const baseAmount = amountInPaise / 100;
      const rate = referral.affiliate.commissionRate;
      const commission = parseFloat((baseAmount * rate).toFixed(2));
      await prisma.$transaction([
        prisma.commission.create({
          data: {
            affiliateId: referral.affiliateId,
            referralId: referral.id,
            razorpayOrderId: orderId,
            baseAmount,
            commissionRate: rate,
            amount: commission,
            status: "pending",
            availableAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.referral.update({
          where: { id: referral.id },
          data: { status: "converted", convertedAt: new Date() },
        }),
        prisma.affiliate.update({
          where: { id: referral.affiliateId },
          data: { totalEarned: { increment: commission } },
        }),
      ]);
    }
  } catch (err) {
    console.error("[fulfillment] affiliate commission error", err);
  }

  return { fulfilled: true, alreadyProcessed: false };
}
