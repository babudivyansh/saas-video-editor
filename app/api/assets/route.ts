import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, getUserTier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { storageLimitBytesForTier } from "@/lib/plans/tiers";
import { getAssetReadUrl } from "@/utils/s3-upload";

async function resolveAssetUrls<T extends { s3Key: string; thumbnailS3Key: string | null }>(
  assets: T[],
): Promise<Array<T & { url: string; thumbnailUrl: string | null }>> {
  return Promise.all(
    assets.map(async (a) => ({
      ...a,
      url: await getAssetReadUrl(a.s3Key),
      thumbnailUrl: a.thumbnailS3Key ? await getAssetReadUrl(a.thumbnailS3Key) : null,
    })),
  );
}

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // Inline stats (avoids /stats sub-route conflicting with /[id] dynamic route).
  // Aggregated in SQL (aggregate + groupBy), not by pulling every row into
  // memory and summing in JS — the old version did that unbounded findMany,
  // which scales linearly with a user's asset count on every stats request.
  if (searchParams.get("stats") === "true") {
    const [totals, byKindRows, tier] = await Promise.all([
      prisma.asset.aggregate({ where: { userId: auth.userId, archivedAt: null }, _sum: { size: true }, _count: true }),
      prisma.asset.groupBy({ by: ["kind"], where: { userId: auth.userId, archivedAt: null }, _count: true }),
      getUserTier(auth.userId),
    ]);
    const totalSize = totals._sum.size ?? 0;
    const count = totals._count;
    const byKind = { video: 0, audio: 0, image: 0 };
    for (const row of byKindRows) {
      if (row.kind === "video") byKind.video = row._count;
      else if (row.kind === "audio") byKind.audio = row._count;
      else if (row.kind === "image") byKind.image = row._count;
    }
    const limitBytes = storageLimitBytesForTier(tier);
    return NextResponse.json({ totalSize, count, byKind, usedBytes: totalSize, limitBytes, tier });
  }

  const kind = searchParams.get("kind") ?? "all";
  const q = searchParams.get("q") ?? "";
  const sort = searchParams.get("sort") ?? "date";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const cursor = searchParams.get("cursor") ?? undefined;
  const folderId = searchParams.get("folderId"); // "none" = unfiled, otherwise a real folder id
  const tag = searchParams.get("tag") ?? undefined;
  const favorite = searchParams.get("favorite") === "true";
  const archived = searchParams.get("archived") === "true";

  const orderBy =
    sort === "name" ? { name: "asc" as const } :
    sort === "size" ? { size: "desc" as const } :
    sort === "oldest" ? { createdAt: "asc" as const } :
    { createdAt: "desc" as const };

  const assets = await prisma.asset.findMany({
    where: {
      userId: auth.userId,
      archivedAt: archived ? { not: null } : null,
      ...(kind !== "all" ? { kind } : {}),
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      ...(favorite ? { isFavorite: true } : {}),
      ...(folderId === "none" ? { folderId: null } : folderId ? { folderId } : {}),
      ...(tag ? { tags: { some: { tag: { name: tag } } } } : {}),
    },
    include: {
      folder: { select: { id: true, name: true, color: true } },
      tags: { include: { tag: { select: { id: true, name: true } } } },
    },
    orderBy,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = assets.length > limit;
  const items = hasMore ? assets.slice(0, limit) : assets;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const resolved = await resolveAssetUrls(items);
  return NextResponse.json({
    assets: resolved.map((a) => ({ ...a, tags: a.tags.map((t) => t.tag) })),
    nextCursor,
  });
}

export const GET = withRateLimit(handleGET, { limit: 120, windowSec: 60, keyBy: "user", name: "assets:list" });
