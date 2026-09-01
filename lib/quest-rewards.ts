import { prisma } from "./prisma";
import { RANK_REWARDS } from "./quest-config";

export interface RankReward {
  level: string;
  reward: number;
}

/**
 * Rank rewards whose credit grant the user has not been shown yet.
 *
 * Deliberately NOT part of the payload GET /api/quests caches in Redis for
 * 300s: that blob is keyed only by user, so a cached copy would keep replaying
 * an already-acknowledged toast for the rest of the TTL. This is one indexed
 * read, merged onto the response after the cache.
 */
export async function unseenRankRewards(userId: string): Promise<RankReward[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { claimedRankRewards: true, rankRewardsSeenAt: true },
  });
  if (!user || user.claimedRankRewards.length === 0) return [];

  const claimed = new Set(user.claimedRankRewards);
  const candidates = RANK_REWARDS.filter(r => claimed.has(r.level));
  if (candidates.length === 0) return [];

  // A rank counts as unseen when its grant transaction is newer than the last
  // acknowledgement. Reading the transaction (rather than trusting the array
  // order) keeps this correct if several ranks are crossed in one completion.
  const seenAt = user.rankRewardsSeenAt;
  const grants = await prisma.creditTransaction.findMany({
    where: {
      userId,
      reason: { in: candidates.map(r => `grant:quest-rank-${r.level}`) },
      ...(seenAt ? { createdAt: { gt: seenAt } } : {}),
    },
    select: { reason: true },
  });

  const unseen = new Set(grants.map(g => g.reason));
  return candidates
    .filter(r => unseen.has(`grant:quest-rank-${r.level}`))
    .map(r => ({ level: r.level, reward: r.reward }));
}

/** Stamps every currently-granted rank reward as shown. */
export async function markRankRewardsSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { rankRewardsSeenAt: new Date() },
  });
}
