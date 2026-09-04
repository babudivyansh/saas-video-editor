// Shared hard-delete core, used by both the user-initiated
// DELETE /api/auth/profile route (password-confirmed, interactive) and the
// deactivation cron's scheduled purge (no password available — the account
// owner already authenticated once, at deactivation time, and the 30-day
// window has since passed). Keeping one implementation means the two paths
// can't silently diverge on what "delete an account" actually does.

import { prisma } from "@/lib/prisma";
import { invalidateAllSessions } from "@/lib/auth";
import { redis } from "@/lib/redis";
import { cancelRazorpaySubscriptionBestEffort } from "@/lib/billing/cancel-on-account-lifecycle";

export type DeleteAccountResult = { ok: true } | { ok: false; reason: string };

// Affiliate/Referral/Commission rows have no onDelete: Cascade in the
// schema, so they must be cleared before the User row can be deleted, or
// Postgres throws a foreign-key violation. Purchase is onDelete: Restrict
// (it's a financial record, never silently destroyed) — refused up front
// with a clear reason rather than letting the transaction throw. Everything
// else (Project + Clip, Asset, UserQuest, SocialAccount + children, etc.)
// cascades automatically.
export async function hardDeleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const purchaseCount = await prisma.purchase.count({ where: { userId } });
  if (purchaseCount > 0) {
    return {
      ok: false,
      reason: "Account has billing history that must be retained for financial records — contact support to request deletion.",
    };
  }

  // Purchase history (checked above) is the common case that would carry a
  // subscription, but razorpaySubscriptionId can exist without a Purchase row
  // in edge cases (e.g. trial-only) — check unconditionally so the account
  // row is never deleted while Razorpay is left auto-charging a mandate that
  // no one can reach anymore. Best-effort: a Razorpay outage must not block
  // the user's own delete request; this runs before the transaction below so
  // it still has a live user row for context if it needs to log one.
  const forCancel = await prisma.user.findUnique({ where: { id: userId }, select: { razorpaySubscriptionId: true } });
  if (forCancel?.razorpaySubscriptionId) {
    await cancelRazorpaySubscriptionBestEffort(forCancel.razorpaySubscriptionId, userId, "delete");
  }

  await prisma.$transaction([
    prisma.commission.deleteMany({ where: { referral: { referredUserId: userId } } }),
    prisma.referral.deleteMany({ where: { referredUserId: userId } }),
    prisma.commission.deleteMany({ where: { affiliate: { userId } } }),
    prisma.referral.deleteMany({ where: { affiliate: { userId } } }),
    prisma.affiliate.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  await Promise.allSettled([
    invalidateAllSessions(userId),
    redis.del(`credits:${userId}`),
  ]);

  return { ok: true };
}
