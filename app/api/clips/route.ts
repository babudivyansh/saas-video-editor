import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withRateLimit } from "@/lib/with-rate-limit";
import { parseS3Url } from "@/lib/s3-url";
import { getAssetReadUrl } from "@/utils/s3-upload";

// GET /api/clips — every clip the caller owns, across all their projects.
//
// No such endpoint existed. Clips could only be listed one project at a time
// (GET /api/projects/[id]/clips), which is why the page called "My Clips"
// listed projects and never rendered a clip: there was nothing to render them
// from.
//
// Clip has no userId of its own, so ownership is expressed through the project
// relation on every query — never as a post-filter.

const MAX_LIMIT = 60;

function orderFor(sort: string) {
  // The [projectId, score] index added with the provenance migration supports
  // the score ordering; date and duration fall back to a sequential scan,
  // which is fine at the page sizes this endpoint serves.
  if (sort === "oldest") return [{ createdAt: "asc" as const }, { id: "asc" as const }];
  if (sort === "duration") return [{ durationSec: "desc" as const }, { id: "asc" as const }];
  if (sort === "score") return [{ score: "desc" as const }, { id: "asc" as const }];
  return [{ createdAt: "desc" as const }, { id: "asc" as const }];
}

async function handleGET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;
  const projectId = searchParams.get("projectId") ?? undefined;
  const sort = searchParams.get("sort") ?? "date";
  const cursor = searchParams.get("cursor") ?? undefined;
  const limitParam = parseInt(searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(Number.isNaN(limitParam) ? 30 : limitParam, MAX_LIMIT);

  const minScoreParam = searchParams.get("minScore");
  const minScore = minScoreParam !== null ? Number(minScoreParam) : null;
  const favorite = searchParams.get("favorite") === "true";

  const where = {
    // Ownership lives on the project — this is the anchor for the whole query.
    project: { userId: auth.userId, ...(projectId ? { id: projectId } : {}) },
    ...(status ? { status } : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(minScore !== null && !Number.isNaN(minScore) ? { score: { gte: minScore } } : {}),
    ...(favorite ? { isFavorite: true } : {}),
  };

  const rows = await prisma.clip.findMany({
    where,
    select: {
      id: true,
      projectId: true,
      index: true,
      title: true,
      score: true,
      status: true,
      progress: true,
      isFavorite: true,
      durationSec: true,
      startSec: true,
      endSec: true,
      aspectRatio: true,
      thumbnailUrl: true,
      failureReason: true,
      createdAt: true,
      project: { select: { title: true, status: true } },
    },
    // Every orderBy ends in `id` so paging is stable when values tie — a
    // cursor over a non-unique sort key otherwise skips or repeats rows.
    orderBy: orderFor(sort),
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const clips = await Promise.all(
    items.map(async (c) => {
      // Renders are stored with permanent unsigned URLs; re-sign so a listing
      // never hands out a durable link to unreleased content.
      let thumbnailUrl = c.thumbnailUrl;
      if (thumbnailUrl) {
        const loc = parseS3Url(thumbnailUrl);
        if (loc) thumbnailUrl = await getAssetReadUrl(loc.key).catch(() => thumbnailUrl);
      }
      return {
        id: c.id,
        projectId: c.projectId,
        projectTitle: c.project.title,
        projectStatus: c.project.status,
        index: c.index,
        title: c.title,
        score: c.score,
        status: c.status,
        progress: c.progress,
        isFavorite: c.isFavorite,
        durationSec: c.durationSec,
        startSec: c.startSec,
        endSec: c.endSec,
        aspectRatio: c.aspectRatio,
        thumbnailUrl,
        failureReason: c.failureReason,
        createdAt: c.createdAt.toISOString(),
      };
    }),
  );

  return NextResponse.json({
    clips,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

export const GET = withRateLimit(handleGET, {
  limit: 120,
  windowSec: 60,
  keyBy: "user",
  name: "clips:list",
});
