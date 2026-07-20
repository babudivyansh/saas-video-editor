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
  | { ok: true; creditsClawedBack: number }
  | { ok: false; error: string; status: number };

export async function refundPurchase(params: {
  purchaseId: string;
  actorId: string; // admin userId, or "system:razorpay-webhook"
  reason: string;
  clawbackCredits: boolean;
  ip?: string;
}): Promise<RefundResult> {
  const { purchaseId, actorId, reason, clawbackCredits, ip } = params;

  const result = await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return { ok: false as const, error: "Purchase not found", status: 404 };
    if (purchase.status === "refunded") {
      return { ok: false as const, error: "Purchase is already refunded", status: 409 };
    }

    await tx.purchase.update({ where: { id: purchaseId }, data: { status: "refunded" } });

    // Claw back at most what was granted, floored at the user's current
    // balance — a refund never drives credits negative. Bucket-aware:
    // purchased first (that's what purchases grant into), ledger-recorded.
    let clawed = 0;
    if (clawbackCredits && purchase.credits > 0) {
      clawed = await clawbackCreditsHelper({
        userId: purchase.userId,
        amount: purchase.credits,
        reason: "clawback:purchase-refund",
        refId: purchaseId,
        tx,
      });
    }
    return { ok: true as const, purchase, clawed };
  });

  if (!result.ok) return result;

  // Keep the cached balance honest after the decrement.
  const fresh = await prisma.user.findUnique({ where: { id: result.purchase.userId }, select: { credits: true } });
  if (fresh) await redis.set(`credits:${result.purchase.userId}`, String(fresh.credits), "EX", 3600);

  await auditAdminAction(params.actorId, "purchase.refunded", params.purchaseId, {
    before: { status: result.purchase.status, credits: result.purchase.credits, amountInPaise: result.purchase.amountInPaise },
    after: { status: "refunded", creditsClawedBack: result.clawed },
    reason,
    ip,
  });
  void actorId;
  return { ok: true, creditsClawedBack: result.clawed };
}

// Manual credit grant/deduct — the audited alternative to silently editing the
// credits number. Deductions floor at zero.
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
