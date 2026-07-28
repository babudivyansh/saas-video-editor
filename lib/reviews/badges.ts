// Review/reviewer badges, computed at read time (never stored) so they're
// always fresh against current counters — cheap at this app's expected
// review volume. "top_helpful" needs one extra query per list render (not
// per-card) to find the percentile threshold; the rest are pure functions
// over data already fetched alongside the review.

import { prisma } from "@/lib/prisma";

export const POWER_USER_GENERATION_THRESHOLD = 50;
// Cutoff for the "early adopter" badge — accounts created before Clipiro's
// public 2026 launch window. A code constant, not an admin-configurable
// setting: it marks a fixed cohort, not a policy that should move over time.
export const EARLY_ADOPTER_CUTOFF = new Date("2026-06-01T00:00:00.000Z");
const TOP_HELPFUL_PERCENTILE = 0.1;

export type ReviewBadge = "verified_customer" | "top_helpful" | "power_user" | "early_adopter";

export interface ReviewBadgeInput {
  verifiedCustomer: boolean;
  helpfulCount: number;
  authorCreatedAt: Date;
  authorCompletedGenerationCount: number;
}

export function computeReviewBadges(input: ReviewBadgeInput, topHelpfulThreshold: number): ReviewBadge[] {
  const badges: ReviewBadge[] = [];
  if (input.verifiedCustomer) badges.push("verified_customer");
  if (input.helpfulCount > 0 && input.helpfulCount >= topHelpfulThreshold) badges.push("top_helpful");
  if (input.authorCompletedGenerationCount >= POWER_USER_GENERATION_THRESHOLD) badges.push("power_user");
  if (input.authorCreatedAt < EARLY_ADOPTER_CUTOFF) badges.push("early_adopter");
  return badges;
}

/**
 * The helpfulCount value at the top-10th-percentile rank among published
 * reviews with at least one helpful vote — reviews at or above this count
 * as "top_helpful". Returns Infinity (nothing qualifies) when there aren't
 * enough voted reviews yet.
 */
export async function computeTopHelpfulThreshold(): Promise<number> {
  const total = await prisma.review.count({ where: { status: "published", helpfulCount: { gt: 0 } } });
  if (total === 0) return Infinity;
  const rank = Math.max(0, Math.floor(total * TOP_HELPFUL_PERCENTILE) - 1);
  const rows = await prisma.review.findMany({
    where: { status: "published", helpfulCount: { gt: 0 } },
    orderBy: { helpfulCount: "desc" },
    skip: rank,
    take: 1,
    select: { helpfulCount: true },
  });
  return rows[0]?.helpfulCount ?? Infinity;
}
