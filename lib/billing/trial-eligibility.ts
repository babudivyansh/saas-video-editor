// Who gets the 7-day Pro trial. Kept apart from lib/billing/trial.ts (which
// grants credits, and so loads lib/credits and Redis) so checkout can ask the
// question without pulling the whole grant path into its module graph.

import { prisma } from "@/lib/prisma";

export type TrialIneligible = "trial-used" | "has-purchased" | "active-plan";

/**
 * "Never paid before": the trial is a first-purchase offer. No earlier trial,
 * no Purchase of ANY kind (a subscription, a renewal or a credit pack), and no
 * plan currently running. The pricing page applies the same rule via
 * /api/auth/me, so what it offers is exactly what checkout accepts.
 */
export async function trialEligibility(userId: string): Promise<TrialIneligible | null> {
  const [user, purchases] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { trialUsedAt: true, subscriptionEndsAt: true, canonicalEmail: true } }),
    prisma.purchase.count({ where: { userId } }),
  ]);
  if (!user || user.trialUsedAt) return "trial-used";
  // Once per inbox, not per account: a second account on "you+2@gmail.com"
  // doesn't get a second week of Pro (lib/email-canonical.ts).
  if (user.canonicalEmail) {
    const sibling = await prisma.user.count({
      where: { canonicalEmail: user.canonicalEmail, id: { not: userId }, trialUsedAt: { not: null } },
    });
    if (sibling > 0) return "trial-used";
  }
  if (purchases > 0) return "has-purchased";
  if (user.subscriptionEndsAt && user.subscriptionEndsAt > new Date()) return "active-plan";
  return null;
}
