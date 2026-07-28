// Review submission eligibility + Verified Customer badge computation.
// Reuses existing tier/usage signals only — no new tracking tables.

import { prisma } from "@/lib/prisma";
import { getUserTier } from "@/lib/auth";
import { tierAtLeast, type TierId } from "@/lib/plans/tiers";
import { isFeatureEnabled } from "@/lib/flags";
import { getReviewSettings } from "@/lib/reviews/settings";

export type NotEligibleReason =
  | "already_reviewed"
  | "no_product_usage"
  | "account_too_new";

export interface EligibilityResult {
  eligible: boolean;
  reason?: NotEligibleReason;
}

export async function isEligibleToSubmit(userId: string): Promise<EligibilityResult> {
  const existing = await prisma.review.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return { eligible: false, reason: "already_reviewed" };

  const settings = await getReviewSettings();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstVideoAt: true, createdAt: true },
  });
  if (!user) return { eligible: false, reason: "no_product_usage" };

  if (settings.requireProductUsage && !user.firstVideoAt) {
    // Fallback: users who only ever used a non-video tool (image/audio
    // generation) still count as "having used the product".
    const completedGeneration = await prisma.generation.findFirst({
      where: { userId, status: "completed" },
      select: { id: true },
    });
    if (!completedGeneration) return { eligible: false, reason: "no_product_usage" };
  }

  if (settings.minAccountAgeHours > 0) {
    const ageHours = (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < settings.minAccountAgeHours) return { eligible: false, reason: "account_too_new" };
  }

  return { eligible: true };
}

export interface VerifiedCustomerResult {
  verified: boolean;
  tier: TierId | null;
}

/**
 * Computed once, at submission time, and snapshotted onto
 * Review.verifiedCustomer/tierAtSubmit — never re-derived later, so a
 * subsequent downgrade/cancellation doesn't retroactively strip the badge.
 */
export async function computeVerifiedCustomer(userId: string): Promise<VerifiedCustomerResult> {
  const tier = await getUserTier(userId);
  if (tierAtLeast(tier, "creator")) return { verified: true, tier };

  // Trial time only counts toward "verified" if the admin has opted in via
  // the existing feature-flag panel (/admin/ops) — default off.
  const trialCounts = await isFeatureEnabled("reviews_trial_counts_as_verified", false);
  if (trialCounts) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trialEndsAt: true },
    });
    if (user?.trialEndsAt && user.trialEndsAt > new Date()) {
      return { verified: true, tier: "creator" };
    }
  }

  return { verified: false, tier: null };
}
