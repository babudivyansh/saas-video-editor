import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertOwnedAccount, ok, parseQuery, withSocial } from "@/lib/social/api";
import { contentQuerySchema } from "@/lib/social/schemas";
import { decodeCursor, keysetOrderBy, keysetWhere, paginate } from "@/lib/social/pagination";
import { capabilityMap } from "@/lib/social/capabilities";
import type { ProviderId } from "@/lib/social/types";
import { postEngagementRate } from "@/lib/social/metrics";

// GET /api/social/content?accountId=…&sort=viralScore&mediaType=reel&cursor=…
//
// Supersedes /api/social/posts. Adds score sorts, media-type and date filters,
// a minimum-views filter, and — the substantive fix — correct keyset pagination
// (see lib/social/pagination.ts: the old id-only cursor skipped or repeated rows
// whenever the sort column tied, which it does constantly for shares and saves).
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, contentQuerySchema);
  const account = await assertOwnedAccount(auth.userId, q.accountId);

  const cursor = decodeCursor(q.cursor);
  const keyset = keysetWhere(q.sort, cursor);

  const filters: Prisma.SocialPostWhereInput[] = [{ accountId: account.id }];
  if (q.mediaType?.length) filters.push({ mediaType: { in: q.mediaType } });
  if (q.minViews !== undefined) filters.push({ views: { gte: q.minViews } });
  if (q.q) filters.push({ caption: { contains: q.q, mode: "insensitive" } });
  if (q.dateFrom) filters.push({ publishedAt: { gte: new Date(`${q.dateFrom}T00:00:00.000Z`) } });
  if (q.dateTo) filters.push({ publishedAt: { lt: new Date(`${q.dateTo}T23:59:59.999Z`) } });
  if (keyset) filters.push(keyset as Prisma.SocialPostWhereInput);

  // Over-fetch by one: that extra row is how we know another page exists
  // without a second COUNT query.
  const rows = await prisma.socialPost.findMany({
    where: { AND: filters },
    orderBy: keysetOrderBy(q.sort) as Prisma.SocialPostOrderByWithRelationInput[],
    take: q.limit + 1,
  });

  const { items, nextCursor } = paginate(rows, q.limit, q.sort as keyof (typeof rows)[number]);

  return ok({
    capabilities: capabilityMap(account.provider as ProviderId, account.capabilitiesJson as never),
    posts: items.map((p) => ({
      id: p.id,
      providerPostId: p.providerPostId,
      caption: p.caption,
      thumbnailUrl: p.thumbnailUrl,
      permalink: p.permalink,
      mediaType: p.mediaType,
      publishedAt: p.publishedAt?.toISOString() ?? null,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      reach: p.reach,
      impressions: p.impressions,
      watchTimeSec: p.watchTimeSec,
      avgWatchTimeSec: p.avgWatchTimeSec,
      avgViewPercentage: p.avgViewPercentage,
      ctr: p.ctr,
      viralScore: p.viralScore,
      aiScore: p.aiScore,
      aiScoreReason: p.aiScoreReason,
      // Derived on read from the same pure function the charts use, so a post's
      // rate never disagrees with the chart it appears in.
      engagementRate: postEngagementRate(p),
    })),
    nextCursor,
  });
}, {
  rateLimit: { key: (auth) => `social:content:${auth.userId}`, max: 60, windowSec: 60 },
});

