import { prisma } from "./prisma";
import { redis } from "./redis";
import { logger } from "./logger";
import { trackOnboardingEvent } from "./onboarding-analytics";
import { QUEST_DEFINITIONS, QUEST_COMPLETION_CREDITS } from "./quest-config";
import { grantCredits } from "./credits";

export async function markQuestComplete(userId: string, questId: string) {
  try {
    await prisma.userQuest.upsert({
      where: { userId_questId: { userId, questId } },
      create: { userId, questId },
      update: {},
    });
    await redis.del(`quests:${userId}`);
    trackOnboardingEvent(userId, "quest_completed", { questId });

    // Award bonus credits if all quests are now complete (once only)
    const completed = await prisma.userQuest.count({ where: { userId } });
    if (completed >= QUEST_DEFINITIONS.length) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { questRewardClaimed: true },
      });
      if (user && !user.questRewardClaimed) {
        await prisma.user.update({ where: { id: userId }, data: { questRewardClaimed: true } });
        // Quest rewards are bonus credits: 30-day expiry, spent first.
        await grantCredits({
          userId,
          bucket: "bonus",
          amount: QUEST_COMPLETION_CREDITS,
          reason: "grant:quest-reward",
          bonusExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
    }
  } catch (err) {
    // Never block the caller, but this must not fail silently — a failed
    // quest completion (and its one-time credit reward) was previously
    // invisible with zero trace in logs or Sentry.
    logger.error("quests", "markQuestComplete failed", { userId, questId, err });
  }
}
