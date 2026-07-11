import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMAGE_MODELS } from "@/lib/models/imageModels";
import { VIDEO_MODELS } from "@/lib/models/videoModels";

// Real usage data read from the Generation ledger (Phase 1) — currently only
// populated by image-generator, video-generator, and ai-creator. No Redis
// caching: usage changes on every generation and staleness would undermine
// trust on a billing surface.

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

function resolveDisplayName(modelId: string | null, toolSlug: string): string {
  if (modelId) {
    const found = IMAGE_MODELS.find(m => m.id === modelId) ?? VIDEO_MODELS.find(m => m.id === modelId);
    if (found) return found.displayName;
  }
  return toolSlug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const days = RANGE_DAYS[rangeParam] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const activeStatuses = ["completed", "pending"] as const;

  const [byModelGroups, rows] = await Promise.all([
    prisma.generation.groupBy({
      by: ["modelId", "toolSlug"],
      where: { userId: auth.userId, createdAt: { gte: since }, status: { in: [...activeStatuses] } },
      _sum: { creditsCost: true },
      _count: true,
    }),
    prisma.generation.findMany({
      where: { userId: auth.userId, createdAt: { gte: since }, status: { in: [...activeStatuses] } },
      select: { creditsCost: true, createdAt: true, toolSlug: true },
    }),
  ]);

  const totalCreditsUsed = rows.reduce((sum, r) => sum + r.creditsCost, 0);

  const byModel = byModelGroups
    .map(g => ({
      modelId: g.modelId,
      toolSlug: g.toolSlug,
      displayName: resolveDisplayName(g.modelId, g.toolSlug),
      count: g._count,
      creditsCost: g._sum.creditsCost ?? 0,
    }))
    .sort((a, b) => b.creditsCost - a.creditsCost);

  const byToolMap = new Map<string, { count: number; creditsCost: number }>();
  for (const g of byModelGroups) {
    const prev = byToolMap.get(g.toolSlug) ?? { count: 0, creditsCost: 0 };
    byToolMap.set(g.toolSlug, { count: prev.count + g._count, creditsCost: prev.creditsCost + (g._sum.creditsCost ?? 0) });
  }
  const byTool = [...byToolMap.entries()]
    .map(([toolSlug, v]) => ({ toolSlug, ...v }))
    .sort((a, b) => b.creditsCost - a.creditsCost);

  // Zero-filled day buckets, done in JS — cheap at this data volume, avoids raw SQL date_trunc.
  const byDay: { date: string; credits: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const credits = rows
      .filter(r => r.createdAt >= day && r.createdAt < next)
      .reduce((sum, r) => sum + r.creditsCost, 0);
    byDay.push({ date: day.toISOString().slice(0, 10), credits });
  }

  return NextResponse.json({ totalCreditsUsed, byModel, byDay, byTool });
}
