import { prisma } from "./prisma";
import { redis } from "./redis";
import { logger } from "./logger";
import { trackOnboardingEvent } from "./onboarding-analytics";
import { RANK_REWARDS, earnedXpFor } from "./quest-config";
import { grantCredits } from "./credits";
import { sendQuestRankRewardEmail } from "./email";

export async function markQuestComplete(userId: string, questId: string) {
  try {
    await prisma.userQuest.upsert({
      where: { userId_questId: { userId, questId } },
      create: { userId, questId },
      update: {},
    });
    await redis.del(`quests:${userId}`);
    trackOnboardingEvent(userId, "quest_completed", { questId });

    // Grant a one-time bonus-credit reward for each rank the user has newly
    // crossed. earnedXp is derived from the quests completed so far, and each
    // rank is paid at most once (tracked in User.claimedRankRewards).
    const completed = await prisma.userQuest.findMany({
      where: { userId },
      select: { questId: true },
    });
    const earnedXp = earnedXpFor(completed.map(q => q.questId));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { claimedRankRewards: true, email: true, name: true },
    });
    if (!user) return;

    const claimed = new Set(user.claimedRankRewards);
    const newlyEarned = RANK_REWARDS.filter(r => earnedXp >= r.minXp && !claimed.has(r.level));
    if (newlyEarned.length === 0) return;

    for (const rank of newlyEarned) {
      // Quest rewards are bonus credits: 30-day expiry, spent first.
      const balances = await grantCredits({
        userId,
        bucket: "bonus",
        amount: rank.reward,
        reason: `grant:quest-rank-${rank.level}`,
        bonusExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      claimed.add(rank.level);

      // These grants used to be completely silent — no toast, no email — so a
      // user could earn every rank reward and have all of it expire unnoticed.
      // Failure to send must not roll back a grant that already happened.
      if (user.email) {
        try {
          await sendQuestRankRewardEmail(
            user.email,
            user.name ?? "",
            rank.level,
            rank.reward,
            balances.total,
          );
        } catch (err) {
          logger.error("quests", "rank reward email failed", { userId, level: rank.level, err });
        }
      }
    }
    await prisma.user.update({
      where: { id: userId },
      data: { claimedRankRewards: Array.from(claimed) },
    });
  } catch (err) {
    // Never block the caller, but this must not fail silently — a failed
    // quest completion (and its rank credit reward) was previously invisible
    // with zero trace in logs or Sentry.
    logger.error("quests", "markQuestComplete failed", { userId, questId, err });
  }
}
