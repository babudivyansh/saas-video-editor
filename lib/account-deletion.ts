// Shared hard-delete core, used by both the user-initiated
// DELETE /api/auth/profile route (password-confirmed, interactive) and the
// deactivation cron's scheduled purge (no password available — the account
// owner already authenticated once, at deactivation time, and the 30-day
// window has since passed). Keeping one implementation means the two paths
// can't silently diverge on what "delete an account" actually does.

import { prisma } from "@/lib/prisma";
import { invalidateAllSessions } from "@/lib/auth";
import { redis } from "@/lib/redis";

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
