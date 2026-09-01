import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { QUEST_DEFINITIONS, TOTAL_XP, xpToLevel, earnedXpFor } from "@/lib/quest-config";
import { markQuestComplete } from "@/lib/quests";
import { unseenRankRewards } from "@/lib/quest-rewards";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { questId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const questId = body.questId ?? "";
  const def = QUEST_DEFINITIONS.find(q => q.id === questId);
  if (!def) return NextResponse.json({ error: "Unknown quest" }, { status: 400 });
  if (def.trigger !== "manual") return NextResponse.json({ error: "Quest cannot be manually completed" }, { status: 400 });

  await markQuestComplete(auth.userId, questId);

  // Return fresh quest state (cache was busted by markQuestComplete)
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

  // Kept out of the cached blob for the same reason as in GET /api/quests.
  return NextResponse.json({
    ...payload,
    newRankRewards: await unseenRankRewards(auth.userId),
  });
}
