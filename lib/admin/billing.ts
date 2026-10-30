// Refund + manual credit-correction logic, shared by the admin routes and the
// Razorpay webhook (which auto-marks purchases refunded when a refund is
// processed in the Razorpay dashboard). Record-keeping v1: no money-moving
// API calls — Razorpay stays the source of funds truth, this is the system of
// record for entitlements (status + credit clawback) with a full audit trail.

import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { auditAdminAction } from "@/lib/admin/audit";
import { clawbackCredits as clawbackCreditsHelper, grantCredits } from "@/lib/credits";

export type RefundResult =
  | { ok: true; creditsClawedBack: number; minutesClawedBack: number; partial: boolean; subscriptionEnded: boolean }
  | { ok: false; error: string; status: number };

/**
 * Mirror a refund onto entitlements.
 *
 * `clawbackCredits` (name kept for the admin API) means "take back what the
 * payment bought": its credits AND its Clip Minutes, and — for a full refund of
 * the user's current subscription charge — the plan itself, which ends now and
 * stops renewing. Before 2026-10-30 only credits came back, so a refunded Pro
 * customer kept Pro and 400 minutes until period end.
 *
 * `refund` is set by the Razorpay webhook. When it covers less than the whole
 * payment the clawback is proportional and the purchase stays "captured"; the
 * refund that completes the total marks it "refunded". Admin refunds omit it
 * and are always full.
 */
export async function refundPurchase(params: {
  purchaseId: string;
  actorId: string; // admin userId, or "system:razorpay-webhook"
  reason: string;
  clawbackCredits: boolean;
  ip?: string;
  refund?: { id: string; amountMinor: number; totalRefundedMinor?: number };
}): Promise<RefundResult> {
  const { purchaseId, actorId, reason, clawbackCredits, ip, refund } = params;

  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return { ok: false as const, error: "Purchase not found", status: 404 };
    if (purchase.status === "refunded") {
      return { ok: false as const, error: "Purchase is already refunded", status: 409 };
    }

    // One mirror per Razorpay refund id: refund.processed and payment.refunded
    // both arrive for the same refund, and only a FULL refund is guarded by the
    // status check above. Claimed inside this transaction, so a failure below
    // rolls the claim back and Razorpay's retry can still apply it.
    if (refund) {
      try {
        await tx.razorpayEvent.create({ data: { id: `refund:${refund.id}`, event: "refund" } });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          return { ok: false as const, error: "Refund already applied", status: 409 };
        }
        throw e;
      }
    }

    // A refund is partial when Razorpay reports less than the whole payment
    // refunded so far. Without a running total, the single refund's amount is
    // the best evidence we have.
    const refundedSoFar = refund ? (refund.totalRefundedMinor ?? refund.amountMinor) : purchase.amountInPaise;
    const partial = refundedSoFar < purchase.amountInPaise;
    // Each refund takes back its own share — the one that completes a run of
    // partial refunds takes only what is left, not the whole grant again.
    const share = refund && purchase.amountInPaise > 0 ? Math.min(refund.amountMinor / purchase.amountInPaise, 1) : 1;

    if (!partial) await tx.purchase.update({ where: { id: purchaseId }, data: { status: "refunded" } });

    // Claw back at most what was granted (or its refunded share), floored at
    // the user's current balance — a refund never drives a balance negative.
    // Bucket-aware and ledger-recorded; a partial refund's rows carry its own
    // refund id so two partial refunds of one payment stay distinguishable.
    const refId = refund && share < 1 ? `${purchaseId}:${refund.id}` : purchaseId;
    let clawed = 0;
    let clawedMinutes = 0;
    if (clawbackCredits && purchase.credits > 0) {
      clawed = await clawbackCreditsHelper({
        userId: purchase.userId,
        amount: Math.round(purchase.credits * share),
        reason: "clawback:purchase-refund",
        refId,
        tx,
      });
    }
    if (clawbackCredits && (purchase.minutes ?? 0) > 0) {
      const { clawbackMinutes } = await import("@/lib/minutes");
      clawedMinutes = await clawbackMinutes({
        userId: purchase.userId,
        amount: Math.round(purchase.minutes * share),
        reason: "clawback:purchase-refund",
        refId,
        tx,
      });
    }
    return { ok: true as const, purchase, clawed, clawedMinutes, partial };
  });

  if (!result.ok) return result;

  // A full refund of the charge that pays for the user's current plan ends it.
  let subscriptionEnded = false;
  if (clawbackCredits && !result.partial && result.purchase.planId) {
    const { endSubscriptionAfterRefund } = await import("@/lib/billing/cancel-subscription");
    subscriptionEnded = await endSubscriptionAfterRefund(result.purchase.userId, result.purchase.planId, purchaseId);
  }

  // Keep the cached balances honest after the decrement.
  const fresh = await prisma.user.findUnique({ where: { id: result.purchase.userId }, select: { credits: true, minutes: true } });
  if (fresh) {
    await redis.set(`credits:${result.purchase.userId}`, String(fresh.credits), "EX", 3600);
    if (typeof fresh.minutes === "number") await redis.set(`minutes:${result.purchase.userId}`, String(fresh.minutes), "EX", 3600).catch(() => {});
  }

  await auditAdminAction(params.actorId, result.partial ? "purchase.partially_refunded" : "purchase.refunded", params.purchaseId, {
    before: { status: result.purchase.status, credits: result.purchase.credits, minutes: result.purchase.minutes, amountInPaise: result.purchase.amountInPaise },
    after: {
      status: result.partial ? result.purchase.status : "refunded",
      creditsClawedBack: result.clawed,
      minutesClawedBack: result.clawedMinutes,
      subscriptionEnded,
      ...(refund ? { refundId: refund.id, refundedMinor: refund.amountMinor } : {}),
    },
    reason,
    ip,
  });
  void actorId;
  return { ok: true, creditsClawedBack: result.clawed, minutesClawedBack: result.clawedMinutes, partial: result.partial, subscriptionEnded };
}

// Manual credit grant/deduct — the audited alternative to silently editing the
// credits number. Deductions floor at zero.
/**
 * The Clip Minutes twin of adjustCredits: an audited grant or deduction with a
 * mandatory reason, through lib/minutes.ts (bucket-aware, ledgered). Grants
 * land in the never-expiring purchased bucket; deductions floor at zero.
 */
export async function adjustMinutes(params: {
  userId: string;
  delta: number;
  actorId: string;
  reason: string;
  ip?: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string; status: number }> {
  const { userId, delta, actorId, reason, ip } = params;
  const { grantMinutes, clawbackMinutes } = await import("@/lib/minutes");

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { minutes: true } });
    if (!user) return { ok: false as const, error: "User not found", status: 404 };
    let applied: number;
    if (delta >= 0) {
      applied = delta;
      await grantMinutes({ userId, bucket: "purchased", amount: delta, reason: "grant:admin-adjust", tx });
    } else {
      applied = -(await clawbackMinutes({ userId, amount: -delta, reason: "clawback:admin-adjust", tx }));
    }
    return { ok: true as const, before: user.minutes, applied, balance: user.minutes + applied };
  });
  if (!result.ok) return result;

  await redis.set(`minutes:${userId}`, String(result.balance), "EX", 3600).catch(() => {});
  await auditAdminAction(actorId, delta >= 0 ? "minutes.granted" : "minutes.deducted", userId, {
    before: { minutes: result.before },
    after: { minutes: result.balance, applied: result.applied },
    reason,
    ip,
  });
  return { ok: true, balance: result.balance };
}

export async function adjustCredits(params: {
  userId: string;
  delta: number; // positive = grant, negative = deduct
  actorId: string;
  reason: string;
  ip?: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string; status: number }> {
  const { userId, delta, actorId, reason, ip } = params;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user) return { ok: false as const, error: "User not found", status: 404 };
    let applied: number;
    if (delta >= 0) {
      // Admin grants land in the never-expiring purchased bucket.
      applied = delta;
      await grantCredits({ userId, bucket: "purchased", amount: delta, reason: "grant:admin-adjust", tx });
    } else {
      // Deductions drain bucket-aware and floor at zero.
      applied = -(await clawbackCreditsHelper({ userId, amount: -delta, reason: "clawback:admin-adjust", tx }));
    }
    return { ok: true as const, before: user.credits, applied, balance: user.credits + applied };
  });
  if (!result.ok) return result;

  await redis.set(`credits:${userId}`, String(result.balance), "EX", 3600);
  await auditAdminAction(actorId, delta >= 0 ? "credits.granted" : "credits.deducted", userId, {
    before: { credits: result.before },
    after: { credits: result.balance, applied: result.applied },
    reason,
    ip,
  });
  return { ok: true, balance: result.balance };
}
