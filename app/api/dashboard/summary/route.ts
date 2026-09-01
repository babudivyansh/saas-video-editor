import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { startedResumableWhere } from "@/lib/project-activity";
import { dashboardSummaryKey, DASHBOARD_SUMMARY_TTL_SECONDS } from "@/lib/dashboard-summary-cache";

const CARD_LIMIT = 5;

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = dashboardSummaryKey(auth.userId);
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached));

  // The tile and the cards now read the same `where`. They used to diverge —
  // the tile counted every product type and every draft, the cards filtered to
  // auto-clip/editor and capped at 5 — so "15 active" could sit above five
  // cards with no way to see the rest.
  const resumable = startedResumableWhere(auth.userId);

  const [totalProjects, completedProjects, totalClips, activeProjects, inProgress] = await Promise.all([
    prisma.project.count({ where: { userId: auth.userId } }),
    prisma.project.count({ where: { userId: auth.userId, status: "completed" } }),
    prisma.clip.count({ where: { project: { userId: auth.userId } } }),
    prisma.project.count({ where: resumable }),
    prisma.project.findMany({
      where: resumable,
      // Last touched, not newest created — this is "Continue where you left
      // off", and ordering by createdAt let five throwaway drafts push the
      // project you actually worked on yesterday off the list.
      orderBy: { updatedAt: "desc" },
      take: CARD_LIMIT,
      include: { _count: { select: { clips: true } } },
    }),
  ]);

  const payload = {
    stats: { totalProjects, activeProjects, completedProjects, totalClips },
    inProgress: inProgress.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      progress: p.progress,
      productType: p.productType,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      clipCount: p._count.clips,
    })),
    // So the UI can offer "View all" instead of silently hiding the remainder.
    inProgressTotal: activeProjects,
    hasAnyProjects: totalProjects > 0,
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", DASHBOARD_SUMMARY_TTL_SECONDS);

  return NextResponse.json(payload);
}
