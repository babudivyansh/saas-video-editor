import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertOwnedAccount, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, accountVersion } from "@/lib/social/cache";
import { accountIdSchema, tzOffsetSchema } from "@/lib/social/schemas";
import { loadAudience } from "@/lib/social/queries";
import { ER_BENCHMARKS, computeAlerts, computeAnalytics, computeBestTimes } from "@/lib/social/analytics";

// GET /api/social/analytics?accountId=…&range=30&tz=<minutes east of UTC>
//
// Computed metrics for one owned account: tiles with period-over-period deltas,
// chart series, top posts, content-type breakdown, best-time-to-post heatmap
// (in the viewer's timezone), weekly alerts, benchmark band, and the latest
// audience demographics. Derived on read from synced rows — no metrics store to
// drift out of sync.
//
// v1's endpoint, now on withSocial + zod + the shared cache helper and the
// {data} envelope every other /api/social route uses.
//
// The audience block changed, though, and that IS a fix: it used to select rows
// matching the newest capturedAt EXACTLY, and rows from one sync do not share a
// timestamp, so it returned a fragment of the capture. It now uses the same
// loadAudience helper as everything else.
const AUDIENCE_WINDOW_DAYS = 45;

/** The three ranges this endpoint has always offered. Widening it would change
 *  its cache keys for no gain — /api/social/overview is the wider surface. */
const legacyRangeSchema = z.coerce.number().int().refine((v) => [7, 30, 90].includes(v), {
  message: "range must be 7, 30 or 90",
});

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({
    accountId: accountIdSchema,
    range: legacyRangeSchema.default(30),
    tz: tzOffsetSchema.default(0),
  }));
  const account = await assertOwnedAccount(auth.userId, q.accountId);

  const version = await accountVersion(account.id);
  const payload = await cached(keys.analytics(account.id, version, q.range, q.tz), CACHE_TTL, async () => {
    const [snapshots, posts, audience] = await Promise.all([
      prisma.socialAccountSnapshot.findMany({
        where: { accountId: account.id },
        orderBy: { capturedAt: "asc" },
        select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
      }),
      // Full history (bounded by the backfill cap) — the engine range-filters in
      // memory, and the heatmap and alerts want everything we have.
      prisma.socialPost.findMany({
        where: { accountId: account.id },
        select: {
          id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true,
          publishedAt: true, views: true, likes: true, comments: true, shares: true,
          saves: true, reach: true, watchTimeSec: true,
        },
      }),
      loadAudience(account.id, new Date(Date.now() - AUDIENCE_WINDOW_DAYS * 86_400_000)),
    ]);

    // One `now` for the whole payload, so every figure in it describes the same
    // instant even if the computation straddles a second boundary.
    const now = new Date();
    return {
      analytics: computeAnalytics(snapshots, posts, q.range, now),
      bestTimes: computeBestTimes(posts, q.tz),
      alerts: computeAlerts(snapshots, posts, now),
      benchmark: ER_BENCHMARKS[account.provider] ?? null,
      audience: audience.rows
        .map(({ dimension, bucket, value }) => ({ dimension, bucket, value }))
        .sort((a, b) => b.value - a.value),
    };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:analytics:${auth.userId}`, max: 60, windowSec: 60 },
});
