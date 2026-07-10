import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const ACTIVE_STATUSES = ["draft", "analyzing", "pending_review", "rendering"];
const RESUMABLE_PRODUCT_TYPES = ["auto-clip", "editor"];

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cacheKey = `dash-summary:${auth.userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return NextResponse.json(JSON.parse(cached));

  const [byStatus, totalClips, inProgress] = await Promise.all([
    prisma.project.groupBy({ by: ["status"], where: { userId: auth.userId }, _count: true }),
    prisma.clip.count({ where: { project: { userId: auth.userId } } }),
    prisma.project.findMany({
      where: { userId: auth.userId, status: { in: ACTIVE_STATUSES }, productType: { in: RESUMABLE_PRODUCT_TYPES } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { _count: { select: { clips: true } } },
    }),
  ]);

  const totalProjects = byStatus.reduce((sum, s) => sum + s._count, 0);
  const activeProjects = byStatus.filter(s => ACTIVE_STATUSES.includes(s.status)).reduce((sum, s) => sum + s._count, 0);
  const completedProjects = byStatus.find(s => s.status === "completed")?._count ?? 0;

  const payload = {
    stats: { totalProjects, activeProjects, completedProjects, totalClips },
    inProgress: inProgress.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      progress: p.progress,
      productType: p.productType,
      createdAt: p.createdAt.toISOString(),
      clipCount: p._count.clips,
    })),
    hasAnyProjects: totalProjects > 0,
  };

  await redis.set(cacheKey, JSON.stringify(payload), "EX", 60);

  return NextResponse.json(payload);
}
