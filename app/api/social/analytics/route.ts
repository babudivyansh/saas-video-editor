import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { ER_BENCHMARKS, computeAlerts, computeAnalytics, computeBestTimes } from "@/lib/social/analytics";
import { analyticsCacheVersionKey } from "@/lib/social/service";

const RANGES = new Set([7, 30, 90]);
const CACHE_TTL = 300; // seconds — invalidated on sync (lib/social/service.ts)

// GET /api/social/analytics?accountId=…&range=30&tz=<minutes east of UTC>
// Computed metrics for one owned account: tiles with period-over-period deltas,
// chart series, top posts, content-type breakdown, best-time-to-post heatmap
// (in the viewer's timezone), weekly alerts, benchmark band, and the latest
// audience demographics. Derived on read from synced rows — no metrics store
// to drift out of sync.
export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) {
    return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  }
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const range = Number(req.nextUrl.searchParams.get("range") ?? 30);
  if (!RANGES.has(range)) return NextResponse.json({ error: "range must be 7, 30 or 90" }, { status: 400 });
  // Client's minutes east of UTC (-new Date().getTimezoneOffset()); quarter-hour
  // granularity keeps the cache from fragmenting on odd values.
  const tzRaw = Number(req.nextUrl.searchParams.get("tz") ?? 0);
  const tz = Number.isFinite(tzRaw) ? Math.round(Math.max(-840, Math.min(840, tzRaw)) / 15) * 15 : 0;

  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: auth.userId },
    select: { id: true, provider: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const version = (await redis.get(analyticsCacheVersionKey(accountId))) ?? "0";
  const cacheKey = `social:analytics:${accountId}:v${version}:${range}:${tz}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return NextResponse.json(JSON.parse(cached));
    } catch {
      /* fall through to recompute */
    }
  }

  const [snapshots, posts, latestAudience] = await Promise.all([
    prisma.socialAccountSnapshot.findMany({
      where: { accountId },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
    }),
    // Full history (bounded by the backfill cap) — the engine range-filters
    // in memory, and the heatmap/alerts want everything we have.
    prisma.socialPost.findMany({
      where: { accountId },
      select: {
        id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true,
        publishedAt: true, views: true, likes: true, comments: true, shares: true,
        saves: true, reach: true, watchTimeSec: true,
      },
    }),
    prisma.socialAudienceSnapshot.findFirst({
      where: { accountId },
      orderBy: { capturedAt: "desc" },
      select: { capturedAt: true },
    }),
  ]);

  const audience = latestAudience
    ? await prisma.socialAudienceSnapshot.findMany({
        where: { accountId, capturedAt: latestAudience.capturedAt },
        select: { dimension: true, bucket: true, value: true },
        orderBy: { value: "desc" },
      })
    : [];

  const payload = {
    analytics: computeAnalytics(snapshots, posts, range),
    bestTimes: computeBestTimes(posts, tz),
    alerts: computeAlerts(snapshots, posts),
    benchmark: ER_BENCHMARKS[account.provider] ?? null,
    audience,
  };
  await redis.set(cacheKey, JSON.stringify(payload), "EX", CACHE_TTL);
  return NextResponse.json(payload);
}
