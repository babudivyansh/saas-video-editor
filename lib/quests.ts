import { prisma } from "./prisma";
import { redis } from "./redis";
import { QUEST_DEFINITIONS, QUEST_COMPLETION_CREDITS } from "./quest-config";

export async function markQuestComplete(userId: string, questId: string) {
  try {
    await prisma.userQuest.upsert({
      where: { userId_questId: { userId, questId } },
      create: { userId, questId },
      update: {},
    });
    await redis.del(`quests:${userId}`);

    // Award bonus credits if all quests are now complete (once only)
    const completed = await prisma.userQuest.count({ where: { userId } });
    if (completed >= QUEST_DEFINITIONS.length) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { questRewardClaimed: true },
      });
      if (user && !user.questRewardClaimed) {
        await prisma.user.update({
          where: { id: userId },
          data: { credits: { increment: QUEST_COMPLETION_CREDITS }, questRewardClaimed: true },
        });
        await redis.del(`credits:${userId}`);
      }
    }
  } catch {
    // never block the caller
  }
}
