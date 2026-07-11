import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPurchaseConfirmationEmail, sendAffiliateCommissionEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

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

type GrantResult =
  | { status: "already-processed" }
  | { status: "no-target" }
  | { status: "granted"; kind: string; credits: number };

export async function fulfillPayment(args: FulfillArgs): Promise<FulfillResult> {
  const { paymentId, orderId, amountInPaise, notes } = args;
  if (!paymentId) return { fulfilled: false, alreadyProcessed: false };

  const userId = notes?.userId;
  const planSlug = notes?.planId ?? notes?.packId;

  // ── Idempotency claim + credit/plan grant, atomically ─────────────────────
  // Both the RazorpayEvent claim and the actual grant happen in one
  // transaction. Previously these were separate calls: if the process crashed
  // between them, the event row existed but no credits were ever granted, and
  // every future retry (webhook redelivery or client verify) would see the
  // event row and silently no-op forever — a paid purchase permanently lost.
  // Now either both commit together, or the whole thing rolls back (including
  // the event row) and a retry safely re-attempts the full grant.
  const result: GrantResult = await prisma.$transaction(async (tx) => {
    try {
      await tx.razorpayEvent.create({
        data: { id: paymentId, event: args.eventName ?? "payment.captured" },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { status: "already-processed" };
      }
      throw e;
    }

    if (!userId || !planSlug) return { status: "no-target" };

    // Resolve everything from the DB plan (single source of truth); fall back
    // to the order notes only if the plan was since removed.
    const plan = await tx.plan.findUnique({ where: { slug: planSlug } });
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
        ? await tx.plan.findMany({ where: { slug: { in: addonSlugs }, kind: "pack" } })
        : [];
      const addonCredits = addons.reduce((s, a) => s + a.credits, 0);
      const totalCredits = monthlyCredits + addonCredits;

      await tx.user.update({
        where: { id: userId },
        data: {
          credits: { increment: totalCredits },
          planId: plan.id,
          subscriptionId: orderId,
          subscriptionEndsAt: endsAt,
          nextRefillAt: months > 1 ? nextRefill : null,
          monthlyCredits,
        },
      });
      await tx.purchase.create({
        data: { id: paymentId, userId, planId: plan.id, amountInPaise, credits: totalCredits, status: "captured" },
      });
      return { status: "granted", kind, credits: totalCredits };
    }

    // One-time top-up pack: add credits to the standard pool.
    const credits = plan?.credits ?? parseInt(notes?.credits ?? "0", 10);
    if (credits > 0) {
      await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: credits } },
      });
      await tx.purchase.create({
        data: { id: paymentId, userId, planId: plan?.id ?? null, amountInPaise, credits, status: "captured" },
      });
    }
    return { status: "granted", kind, credits };
  });

  if (result.status === "already-processed") return { fulfilled: false, alreadyProcessed: true };
  if (result.status === "no-target") return { fulfilled: false, alreadyProcessed: false };
  const { kind, credits } = result;
  // Guaranteed defined past the "no-target" check above (that's exactly the
  // case where either was missing).
  const uid = userId as string;

  // ── Post-commit cache refresh (best-effort) ───────────────────────────────
  // Redis is a cache with a TTL, not the source of truth, so it doesn't need
  // to be part of the transaction above.
  const fresh = await prisma.user.findUnique({ where: { id: uid }, select: { credits: true } });
  if (fresh) await redis.set(`credits:${uid}`, String(fresh.credits), "EX", 3600);

  // ── Purchase confirmation email (non-fatal) ───────────────────────────────
  try {
    const user = await prisma.user.findUnique({
      where: { id: uid },
      select: { email: true, firstName: true, name: true },
    });
    if (user) {
      const planForEmail = await prisma.plan.findUnique({ where: { slug: planSlug } });
      const creditsForEmail = planForEmail?.credits ?? credits;
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
    logger.error("fulfillment", "purchase confirmation email error", err);
  }

  // ── Coupon redemption (non-fatal) ──────────────────────────────────────────
  if (notes?.couponId) {
    try {
      const discountInPaise = parseInt(notes.discountInPaise ?? "0", 10) || 0;
      await prisma.$transaction([
        prisma.couponRedemption.create({
          data: { couponId: notes.couponId, userId: uid, orderId, discountInPaise },
        }),
        prisma.coupon.update({
          where: { id: notes.couponId },
          data: { timesRedeemed: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        logger.warn("fulfillment", "coupon already redeemed by user, skipping duplicate");
      } else {
        logger.error("fulfillment", "coupon redemption error", err);
      }
    }
  }

  // ── Affiliate commission (non-fatal, first payment only) ───────────────────
  try {
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: uid },
      include: { affiliate: true },
    });
    if (referral && referral.status === "signed_up" && referral.affiliate.status === "active") {
      const baseAmount = amountInPaise / 100;
      const rate = referral.affiliate.commissionRate;
      // Cap commission at ₹2,000 per referral to protect margins on large plans.
      const commission = Math.min(parseFloat((baseAmount * rate).toFixed(2)), 2000);
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

      // ── Notify affiliate of commission (non-fatal) ─────────────────
      try {
        const affiliateUser = await prisma.user.findUnique({
          where: { id: referral.affiliate.userId },
          select: { email: true, firstName: true, name: true },
        });
        if (affiliateUser) {
          const updatedAffiliate = await prisma.affiliate.findUnique({
            where: { id: referral.affiliateId },
            select: { totalEarned: true },
          });
          const availableAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          sendAffiliateCommissionEmail(
            affiliateUser.email,
            affiliateUser.firstName ?? affiliateUser.name ?? "",
            commission,
            baseAmount,
            updatedAffiliate?.totalEarned ?? commission,
            availableAt,
          ).catch((e) => logger.error("fulfillment", "affiliate commission email error", e));
        }
      } catch (e) {
        logger.error("fulfillment", "affiliate commission email lookup error", e);
      }
    }
  } catch (err) {
    logger.error("fulfillment", "affiliate commission error", err);
  }

  return { fulfilled: true, alreadyProcessed: false };
}
