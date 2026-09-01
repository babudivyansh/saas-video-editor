import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { QUEST_DEFINITIONS, TOTAL_XP, xpToLevel, earnedXpFor } from "@/lib/quest-config";
import { unseenRankRewards } from "@/lib/quest-rewards";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // newRankRewards is merged on *after* the cache on purpose — see
  // lib/quest-rewards.ts. Caching it would replay the toast for the whole TTL.
  const cached = await redis.get(`quests:${auth.userId}`);
  if (cached) {
    return NextResponse.json({
      ...JSON.parse(cached),
      newRankRewards: await unseenRankRewards(auth.userId),
    });
  }

  const completed = await prisma.userQuest.findMany({
    where: { userId: auth.userId },
    select: { questId: true, completedAt: true },
  });

  const completedMap = new Map(completed.map(q => [q.questId, q.completedAt.toISOString()]));

  const quests = QUEST_DEFINITIONS.map(def => ({
    id: def.id,
    title: def.title,
    xp: def.xp,
    trigger: def.trigger,
    completedAt: completedMap.get(def.id) ?? null,
  }));

  const earnedXp = earnedXpFor(completedMap.keys());
  const remaining = quests.filter(q => !q.completedAt).length;
  const allComplete = remaining === 0;

  const payload = {
    quests,
    earnedXp,
    totalXp: TOTAL_XP,
    remaining,
    level: xpToLevel(earnedXp),
    allComplete,
  };

  await redis.set(`quests:${auth.userId}`, JSON.stringify(payload), "EX", 300);

  return NextResponse.json({
    ...payload,
    newRankRewards: await unseenRankRewards(auth.userId),
  });
}
