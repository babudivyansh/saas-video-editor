import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { startedResumableWhere } from "@/lib/project-activity";
import {
  dashboardSummaryKey,
  DASHBOARD_SUMMARY_TTL_SECONDS,
  DASHBOARD_SUMMARY_ACTIVE_TTL_SECONDS,
} from "@/lib/dashboard-summary-cache";
import { withRunProgress } from "@/lib/run-progress";
import { resignMediaUrl } from "@/lib/signed-media";
import { resignOwnedMediaUrl } from "@/lib/source-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

const CARD_LIMIT = 5;
/**
 * A real picture for a Continue card, best first: the first rendered clip's
 * thumbnail, then the uploaded source's extracted thumbnail. With neither (a
 * run still analyzing a source that has no thumbnail yet), the source video
 * itself, which the card shows a frame of. All signed — the bucket is private.
 */
async function cardMedia(
  p: {
    clips?: { thumbnailUrl: string | null }[];
    sourceAsset?: { thumbnailS3Key: string | null } | null;
    uploadedVideoUrl?: string | null;
  },
  userId: string,
): Promise<{ coverUrl: string | null; sourceUrl: string | null }> {
  const clipThumb = p.clips?.[0]?.thumbnailUrl ?? null;
  // Server-written, so any own-bucket URL is safe to sign.
  if (clipThumb) return { coverUrl: await resignMediaUrl(clipThumb).catch(() => null), sourceUrl: null };
  const assetThumb = p.sourceAsset?.thumbnailS3Key;
  if (assetThumb) return { coverUrl: await getAssetReadUrl(assetThumb).catch(() => null), sourceUrl: null };
  // Client-settable, so only signed when the caller owns the object.
  const sourceUrl = await resignOwnedMediaUrl(p.uploadedVideoUrl ?? null, userId).catch(() => null);
  return { coverUrl: null, sourceUrl };
}

const ACTIVE_STATUSES = new Set(["queued", "analyzing", "rendering"]);

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
      include: {
        _count: { select: { clips: true } },
        // The card's picture: the run's first rendered clip, if any yet.
        clips: { where: { thumbnailUrl: { not: null } }, orderBy: { index: "asc" }, take: 1, select: { thumbnailUrl: true } },
        sourceAsset: { select: { thumbnailS3Key: true } },
      },
    }),
  ]);
  // Project.progress is never written during an AutoClip render — the real
  // number is on the clips.
  const inProgressRows = await withRunProgress(inProgress);
  const media = await Promise.all(inProgressRows.map(p => cardMedia(p, auth.userId)));

  const payload = {
    stats: { totalProjects, activeProjects, completedProjects, totalClips },
    inProgress: inProgressRows.map((p, i) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      progress: p.progress,
      productType: p.productType,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      clipCount: p._count.clips,
      ...media[i],
    })),
    // So the UI can offer "View all" instead of silently hiding the remainder.
    inProgressTotal: activeProjects,
    hasAnyProjects: totalProjects > 0,
  };

  // Home polls while a run is moving; a 60s cache would freeze its progress.
  const active = payload.inProgress.some(p => ACTIVE_STATUSES.has(p.status));
  await redis.set(
    cacheKey,
    JSON.stringify(payload),
    "EX",
    active ? DASHBOARD_SUMMARY_ACTIVE_TTL_SECONDS : DASHBOARD_SUMMARY_TTL_SECONDS,
  );

  return NextResponse.json(payload);
}
