// Creator partner programme (2026-11-17).
//
// Some affiliates are creators an admin has marked as partners
// (Affiliate.isCreatorPartner). Their referral link does two extra things on
// top of the ordinary affiliate commission:
//
//  1. The person who signs up through it gets the creator discount on their
//     first paid purchase. Subscriptions take no coupons (lib/coupons.ts), so
//     on a plan it is a Razorpay *Offer* created in the Razorpay dashboard and
//     attached with `offer_id` at subscription create — the same mechanism the
//     Diwali offer used. On a one-time pack it is taken off the order amount.
//  2. When that person buys a qualifying plan (Pro or Studio by default), the
//     referral counts toward the creator's goal (10 by default). Reaching it
//     earns a free year of Pro, which an admin grants by hand.
//
// Settings live in the Config KV so admins change them without a rebuild.
// With no row the programme is ON with no offer id, which means: tracking
// works, and no discount is claimed or charged anywhere until an admin pastes
// the offer id in. A page never promises money off that checkout won't take.
//
// Everything here that runs on a payment path is non-fatal by contract: a bug
// in the creator programme must never fail fulfilment or block a checkout.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { notifyAdmins, notify } from "@/lib/notify";
import type { TierId } from "@/lib/plans/tiers";

export const CREATOR_PROGRAM_KEY = "creator_program";

export type QualifyingTier = Extract<TierId, "lite" | "creator" | "pro" | "studio">;

export interface CreatorProgramSettings {
  /** Master switch: off = no discount, no new qualifying sales counted. */
  enabled: boolean;
  /** Percent off the buyer's first payment, 1–50. On plans it must match the
   *  Razorpay Offer, which is what is actually charged. */
  discountPct: number;
  /** Razorpay Offer id (offer_XXXXXXXXXXXXXX) for subscriptions. Null = no
   *  plan discount is shown or applied. */
  razorpayOfferId: string | null;
  /** Qualifying sales needed for the free year of Pro. */
  goal: number;
  /** Plan tiers whose purchase counts toward the goal. */
  qualifyingTiers: QualifyingTier[];
}

export const DEFAULT_CREATOR_PROGRAM: CreatorProgramSettings = {
  enabled: true,
  discountPct: 10,
  razorpayOfferId: null,
  goal: 10,
  qualifyingTiers: ["pro", "studio"],
};

const ALL_TIERS: readonly QualifyingTier[] = ["lite", "creator", "pro", "studio"];
export const OFFER_ID_RE = /^offer_[A-Za-z0-9]{14}$/;

/** Coerce anything stored (or posted) into valid settings, field by field. */
export function normalizeCreatorProgram(v: Partial<CreatorProgramSettings> | null | undefined): CreatorProgramSettings {
  const d = DEFAULT_CREATOR_PROGRAM;
  const pct = Number(v?.discountPct);
  const goal = Number(v?.goal);
  const offer = typeof v?.razorpayOfferId === "string" ? v.razorpayOfferId.trim() : "";
  const tiers = Array.isArray(v?.qualifyingTiers)
    ? ALL_TIERS.filter((t) => (v.qualifyingTiers as unknown[]).includes(t))
    : d.qualifyingTiers;
  return {
    enabled: typeof v?.enabled === "boolean" ? v.enabled : d.enabled,
    discountPct: Number.isInteger(pct) && pct >= 1 && pct <= 50 ? pct : d.discountPct,
    razorpayOfferId: OFFER_ID_RE.test(offer) ? offer : null,
    goal: Number.isInteger(goal) && goal >= 1 && goal <= 1000 ? goal : d.goal,
    qualifyingTiers: tiers.length ? tiers : d.qualifyingTiers,
  };
}

export async function getCreatorProgram(): Promise<CreatorProgramSettings> {
  try {
    const row = await prisma.config.findUnique({ where: { key: CREATOR_PROGRAM_KEY } });
    if (!row) return { ...DEFAULT_CREATOR_PROGRAM };
    return normalizeCreatorProgram(JSON.parse(row.value));
  } catch (e) {
    logger.error("creator-program", "settings read failed — using defaults", e);
    return { ...DEFAULT_CREATOR_PROGRAM };
  }
}

export async function setCreatorProgram(v: Partial<CreatorProgramSettings>): Promise<CreatorProgramSettings> {
  const value = normalizeCreatorProgram(v);
  await prisma.config.upsert({
    where: { key: CREATOR_PROGRAM_KEY },
    update: { value: JSON.stringify(value) },
    create: { key: CREATOR_PROGRAM_KEY, value: JSON.stringify(value) },
  });
  return value;
}

/** True when the creator discount is really charged: programme on and an
 *  offer id configured. Until then no discount is shown or applied anywhere —
 *  packs included — so there is one switch to reason about. */
export function planDiscountLive(s: CreatorProgramSettings): boolean {
  return s.enabled && s.razorpayOfferId !== null;
}

export interface CreatorDiscount {
  affiliateId: string;
  creatorHandle: string | null;
  discountPct: number;
  razorpayOfferId: string;
}

/**
 * The creator discount this user may use right now, or null. Eligible when:
 * the discount is live (planDiscountLive), they signed up through an active creator partner's
 * link (a non-flagged referral), and they have never completed a paid
 * purchase. "First payment only" is judged by captured Purchase rows, so an
 * abandoned checkout doesn't use the discount up.
 */
export async function creatorDiscountFor(userId: string): Promise<CreatorDiscount | null> {
  try {
    const settings = await getCreatorProgram();
    if (!planDiscountLive(settings) || !settings.razorpayOfferId) return null;
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: userId },
      select: {
        status: true,
        affiliate: { select: { id: true, status: true, isCreatorPartner: true, creatorHandle: true } },
      },
    });
    if (!referral || referral.status === "flagged" || referral.status === "fraudulent") return null;
    if (!referral.affiliate.isCreatorPartner || referral.affiliate.status !== "active") return null;
    const paid = await prisma.purchase.findFirst({
      where: { userId, amountInPaise: { gt: 0 } },
      select: { id: true },
    });
    if (paid) return null;
    return {
      affiliateId: referral.affiliate.id,
      creatorHandle: referral.affiliate.creatorHandle,
      discountPct: settings.discountPct,
      razorpayOfferId: settings.razorpayOfferId,
    };
  } catch (e) {
    logger.error("creator-program", `discount lookup failed for ${userId}`, e);
    return null;
  }
}

/** Discount in minor units on a one-time order (packs). */
export function creatorDiscountMinor(amountMinor: number, pct: number): number {
  return Math.round((amountMinor * pct) / 100);
}

/** Live qualifying-sale count for one affiliate. */
export function countQualified(affiliateId: string): Promise<number> {
  return prisma.referral.count({ where: { affiliateId, qualifiedAt: { not: null } } });
}

/**
 * Called after a payment is fulfilled (both the one-time and the subscription
 * paths). If the payer was referred by a creator partner and this purchase is
 * a qualifying tier, the referral counts — once. Reaching the goal for the
 * first time notifies the admins and the creator. Never throws.
 */
export async function recordCreatorQualifyingSale(args: {
  userId: string;
  paymentId: string;
  tier: string | null | undefined;
}): Promise<void> {
  try {
    if (!args.tier) return;
    const settings = await getCreatorProgram();
    if (!settings.enabled || !(settings.qualifyingTiers as string[]).includes(args.tier)) return;
    const referral = await prisma.referral.findUnique({
      where: { referredUserId: args.userId },
      select: {
        id: true,
        status: true,
        qualifiedAt: true,
        affiliate: {
          select: { id: true, userId: true, status: true, isCreatorPartner: true, creatorHandle: true, creatorGoalReachedAt: true },
        },
      },
    });
    if (!referral || referral.qualifiedAt) return;
    if (referral.status === "flagged" || referral.status === "fraudulent") return;
    const aff = referral.affiliate;
    if (!aff.isCreatorPartner || aff.status !== "active") return;

    // Conditional update: only the first qualifying payment wins, even if two
    // webhooks race.
    const { count } = await prisma.referral.updateMany({
      where: { id: referral.id, qualifiedAt: null },
      data: { qualifiedAt: new Date(), qualifyingTier: args.tier, qualifyingPaymentId: args.paymentId },
    });
    if (count === 0) return;

    const total = await countQualified(aff.id);
    if (total < settings.goal || aff.creatorGoalReachedAt) return;
    const { count: first } = await prisma.affiliate.updateMany({
      where: { id: aff.id, creatorGoalReachedAt: null },
      data: { creatorGoalReachedAt: new Date() },
    });
    if (first === 0) return;
    const who = aff.creatorHandle ?? "A creator partner";
    await notifyAdmins(
      "admin_creator_goal_reached",
      "Creator reached the free Pro goal",
      `${who} has ${total} qualifying sales. Grant their free year of Pro from Admin → Affiliates → Creators.`,
      "/admin/affiliate?tab=creators",
      { affiliateId: aff.id, total },
    );
    await notify({
      userId: aff.userId,
      type: "creator_goal_reached",
      title: "You've hit your goal 🎉",
      body: `${total} people bought a plan through your link. We'll switch on your free year of Clipiro Pro shortly.`,
      href: "/dashboard/referral",
    });
  } catch (e) {
    logger.error("creator-program", `qualifying-sale record failed for ${args.userId} / ${args.paymentId}`, e);
  }
}

/**
 * A full refund (or a lost chargeback) of the payment that qualified a
 * referral un-counts it, so the goal can't be reached on money that was given
 * back. A later qualifying purchase by the same person can count again.
 * creatorGoalReachedAt is deliberately left alone. Never throws.
 */
export async function unqualifyRefundedPayment(paymentId: string): Promise<void> {
  try {
    await prisma.referral.updateMany({
      where: { qualifyingPaymentId: paymentId },
      data: { qualifiedAt: null, qualifyingTier: null, qualifyingPaymentId: null },
    });
  } catch (e) {
    logger.error("creator-program", `unqualify after refund failed for ${paymentId}`, e);
  }
}

export type GrantRewardResult =
  | { ok: true; planName: string; endsAt: Date }
  | { ok: false; status: number; error: string };

/**
 * Admin action: give a creator partner their free year of Pro. Assigns the
 * active yearly Pro plan the same way Admin → Users does a manual plan grant
 * (12-month term, first month's minutes + credits now, monthly refills via the
 * refill cron) and stamps creatorRewardGrantedAt so it can't be granted twice.
 *
 * Refused while the creator pays for a live Razorpay subscription: overwriting
 * it here would leave a mandate charging them for a plan they no longer see.
 * The admin cancels that first (Admin → Users), then grants.
 */
export async function grantCreatorReward(affiliateId: string, adminId: string): Promise<GrantRewardResult> {
  const settings = await getCreatorProgram();
  const aff = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: {
      id: true, userId: true, isCreatorPartner: true, creatorRewardGrantedAt: true,
      user: { select: { razorpaySubscriptionId: true, subscriptionEndsAt: true } },
    },
  });
  if (!aff) return { ok: false, status: 404, error: "Affiliate not found" };
  if (!aff.isCreatorPartner) return { ok: false, status: 409, error: "This affiliate isn't a creator partner." };
  if (aff.creatorRewardGrantedAt) return { ok: false, status: 409, error: "The free year of Pro was already granted." };
  const qualified = await countQualified(aff.id);
  if (qualified < settings.goal) {
    return { ok: false, status: 409, error: `Only ${qualified} of ${settings.goal} qualifying sales so far.` };
  }
  if (aff.user.razorpaySubscriptionId && aff.user.subscriptionEndsAt && aff.user.subscriptionEndsAt > new Date()) {
    return {
      ok: false,
      status: 409,
      error: "This creator pays for an active subscription. Cancel it from Admin → Users first, then grant the free year.",
    };
  }

  const plan = await prisma.plan.findFirst({
    where: { kind: "subscription", tier: "pro", intervalMonths: 12, active: true },
    orderBy: { sortOrder: "asc" },
  });
  if (!plan) return { ok: false, status: 409, error: "No active yearly Pro plan exists to grant." };

  const { grantCredits } = await import("@/lib/credits");
  const { grantMinutes } = await import("@/lib/minutes");
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 12);
  const nextRefill = new Date(now);
  nextRefill.setMonth(nextRefill.getMonth() + 1);
  const monthlyCredits = plan.monthlyCredits ?? plan.credits;
  const monthlyMinutes = plan.monthlyMinutes ?? 0;

  const granted = await prisma.$transaction(async (tx) => {
    // Claim first: a double click can't grant two years.
    const { count } = await tx.affiliate.updateMany({
      where: { id: aff.id, creatorRewardGrantedAt: null },
      data: { creatorRewardGrantedAt: now, creatorRewardGrantedBy: adminId },
    });
    if (count === 0) return false;
    await tx.user.update({
      where: { id: aff.userId },
      data: {
        planId: plan.id,
        subscriptionEndsAt: endsAt,
        monthlyCredits,
        monthlyMinutes,
        subscriptionId: null,
        nextRefillAt: nextRefill,
        freeCreditsRefillAt: null,
      },
    });
    await grantCredits({ userId: aff.userId, bucket: "subscription", amount: monthlyCredits, reason: "grant:creator-reward", tx });
    if (monthlyMinutes > 0) {
      await grantMinutes({ userId: aff.userId, bucket: "subscription", amount: monthlyMinutes, reason: "grant:creator-reward", tx });
    }
    return true;
  });
  if (!granted) return { ok: false, status: 409, error: "The free year of Pro was already granted." };

  await notify({
    userId: aff.userId,
    type: "creator_goal_reached",
    title: "Your free year of Clipiro Pro is on 🎉",
    body: `Thanks for sharing Clipiro. Pro is active until ${endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
    href: "/dashboard?billing=1",
  });
  return { ok: true, planName: plan.name, endsAt };
}
