import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { computeAnalytics } from "@/lib/social/analytics";

const RANGES = new Set([7, 30, 90]);
const CACHE_TTL = 300; // seconds — invalidated on sync (lib/social/service.ts)

// GET /api/social/analytics?accountId=…&range=30
// Computed metrics for one owned account: tiles with period-over-period deltas,
// chart series, top posts, and content-type breakdown. Numbers are derived on
// read from snapshots/posts (no separate metrics store to drift out of sync).
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const range = Number(req.nextUrl.searchParams.get("range") ?? 30);
  if (!RANGES.has(range)) return NextResponse.json({ error: "range must be 7, 30 or 90" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const cacheKey = `social:analytics:${accountId}:${range}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return NextResponse.json(JSON.parse(cached));
    } catch {
      /* fall through to recompute */
    }
  }

  // Deltas need a baseline before the range and a previous same-length period,
  // so pull 2× the window (plus the pre-window latest via ascending order).
  const since = new Date(Date.now() - range * 2 * 86400_000);
  const [snapshots, posts] = await Promise.all([
    prisma.socialAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
    }),
    prisma.socialPost.findMany({
      where: { accountId, publishedAt: { gte: since } },
      select: {
        id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true,
        publishedAt: true, views: true, likes: true, comments: true, shares: true,
        saves: true, reach: true, watchTimeSec: true,
      },
    }),
  ]);

  const payload = { analytics: computeAnalytics(snapshots, posts, range) };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);
  return NextResponse.json(payload);
}
