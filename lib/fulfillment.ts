import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { sendPurchaseConfirmationEmail, sendAffiliateCommissionEmail, sendSubscriptionRenewedEmail } from "@/lib/email";
import { markQuestComplete } from "@/lib/quests";
import { grantCredits, getBalances } from "@/lib/credits";
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

// ── Razorpay Subscriptions (recurring) ──────────────────────────────────────

export interface SubscriptionChargeArgs {
  /** Razorpay subscription id (sub_...) the charge belongs to. */
  subscriptionId: string;
  /** Razorpay payment id (pay_...) — idempotency key via RazorpayEvent. */
  paymentId: string;
  amountInPaise: number;
  eventName?: string;
  /**
   * `notes.userId` from the subscription entity, set at checkout. Used only to
   * recover when the razorpaySubscriptionId link has been lost — see the
   * re-link path in fulfillSubscriptionCharge.
   */
  notesUserId?: string;
}

/**
 * Grant a recurring `subscription.charged` webhook: monthly credits into the
 * subscription bucket WITH the 2x rollover cap, term extended one month
 * (+3 days grace so a slow retry doesn't lapse the account), Purchase row
 * recorded. Idempotent via the same RazorpayEvent claim as one-time payments.
 */
export async function fulfillSubscriptionCharge(args: SubscriptionChargeArgs): Promise<FulfillResult> {
  const { subscriptionId, paymentId, amountInPaise, notesUserId } = args;
  if (!subscriptionId || !paymentId) return { fulfilled: false, alreadyProcessed: false };

  const SELECT = {
    id: true, planId: true, monthlyCredits: true, razorpaySubscriptionId: true,
    plan: { select: { id: true, monthlyCredits: true, credits: true } },
  } as const;

  let user = await prisma.user.findUnique({
    where: { razorpaySubscriptionId: subscriptionId },
    select: SELECT,
  });

  // Recovery path. The link can be missing because a renewal arrived after the
  // account had already been lapsed locally (a soft decline that Razorpay
  // retried, a bank outage, a webhook backlog). Before this existed the charge
  // was dropped on the floor: money captured, no credits, no Purchase row, no
  // alert — and no RazorpayEvent claim either, so the payment was invisible.
  // `notes.userId` is stamped on the subscription at checkout and is the
  // authoritative owner, so re-link from it and carry on with fulfilment.
  if (!user && notesUserId) {
    const byNotes = await prisma.user.findUnique({ where: { id: notesUserId }, select: SELECT });
    // Never steal a subscription from a user who is actively on a different
    // one — that would be a worse failure than dropping the charge.
    if (byNotes && !byNotes.razorpaySubscriptionId) {
      await prisma.user.update({
        where: { id: byNotes.id },
        data: { razorpaySubscriptionId: subscriptionId },
      });
      logger.warn(
        "fulfillment",
        `re-linked subscription ${subscriptionId} to user ${byNotes.id} from notes.userId — the local link had been lost`,
      );
      user = { ...byNotes, razorpaySubscriptionId: subscriptionId };
    }
  }

  if (!user) {
    logger.error("fulfillment", `subscription.charged for unknown subscription ${subscriptionId}`);
    return { fulfilled: false, alreadyProcessed: false };
  }

  const monthlyCredits = user.plan?.monthlyCredits ?? user.monthlyCredits ?? 0;

  const result = await prisma.$transaction(async (tx) => {
    try {
      await tx.razorpayEvent.create({
        data: { id: paymentId, event: args.eventName ?? "subscription.charged" },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { alreadyProcessed: true };
      }
      throw e;
    }

    // Rollover cap: subscription bucket tops out at 2x the monthly grant.
    const { SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER } = await import("@/lib/plans/tiers");
    const bal = await getBalances(user.id, tx);
    const cap = monthlyCredits * SUBSCRIPTION_ROLLOVER_CAP_MULTIPLIER;
    const applied = Math.max(Math.min(bal.subscription + monthlyCredits, cap) - bal.subscription, 0);
    if (applied > 0) {
      await grantCredits({
        userId: user.id, bucket: "subscription", amount: applied,
        reason: "grant:subscription-charge", refId: paymentId, tx,
      });
    }

    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + 1);
    endsAt.setDate(endsAt.getDate() + 3); // grace for slow renewals
    await tx.user.update({
      where: { id: user.id },
      data: {
        subscriptionEndsAt: endsAt,
        monthlyCredits,
        lowCreditEmailSentAt: null,
        // Recurring subs never cron-refill; renewal IS the refill.
        nextRefillAt: null,
        trialEndsAt: null,
        // A successful charge ends any dunning state — the card worked.
        paymentFailedAt: null,
        paymentFailureCount: 0,
        paymentFailedEmailSentAt: null,
      },
    });
    await tx.purchase.create({
      data: { id: paymentId, userId: user.id, planId: user.plan?.id ?? user.planId, amountInPaise, credits: applied, status: "captured" },
    });
    return { alreadyProcessed: false, applied, endsAt };
  });

  if (result.alreadyProcessed) return { fulfilled: false, alreadyProcessed: true };

  const balances = await getBalances(user.id);
  await redis.set(`credits:${user.id}`, String(balances.total), "EX", 3600).catch(() => {});

  // Renewal receipt. Recurring subscribers previously got no email on any
  // renewal, ever — sendPurchaseConfirmationEmail only fires from
  // fulfillPayment (first purchase), and the cron's refill email excludes
  // subscription-backed accounts. So the only customers charged every month
  // were the only ones never told.
  const recipient = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, firstName: true, name: true },
  });
  if (recipient) {
    await prisma.subscriptionEvent.create({
      data: { userId: user.id, subscriptionId, type: "charged" },
    }).catch(() => {});
    await sendSubscriptionRenewedEmail(
      recipient.email,
      recipient.firstName ?? recipient.name ?? "",
      amountInPaise,
      result.applied ?? 0,
      result.endsAt ?? null,
    ).catch((e: unknown) => logger.error("fulfillment", `renewal email failed for ${user.id}`, e));
  }

  return { fulfilled: true, alreadyProcessed: false };
}

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

      // Monthly grant goes to the subscription bucket; bundled add-on packs
      // are purchased credits (never expire).
      await grantCredits({ userId, bucket: "subscription", amount: monthlyCredits, reason: "grant:subscription", refId: paymentId, tx });
      if (addonCredits > 0) {
        await grantCredits({ userId, bucket: "purchased", amount: addonCredits, reason: "grant:pack-addon", refId: paymentId, tx });
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          planId: plan.id,
          subscriptionId: orderId,
          subscriptionEndsAt: endsAt,
          // 1-month prepaid terms expire exactly when a refill would be due, so
          // they get no cron refill — renewal comes from a new payment (moving
          // to Razorpay Subscriptions' subscription.charged for true recurring).
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
      await grantCredits({ userId, bucket: "purchased", amount: credits, reason: "grant:pack", refId: paymentId, tx });
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
      // A subscription purchase is a plan upgrade; a one-time credit pack isn't.
      if (isSubscription) void markQuestComplete(uid, "upgraded-plan");
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

      // A referral just converted — credit the referrer's "Refer a friend" quest.
      void markQuestComplete(referral.affiliate.userId, "refer-friend");

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
