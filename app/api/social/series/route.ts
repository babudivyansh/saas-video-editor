import type { NextRequest } from "next/server";
import { assertOwnedAccounts, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, userVersion } from "@/lib/social/cache";
import { seriesQuerySchema } from "@/lib/social/schemas";
import { loadAccounts, loadSeries } from "@/lib/social/queries";
import { rangeBounds } from "@/lib/social/metrics";

// GET /api/social/series
//   ?accountIds=a,b&metrics=followers,reach&range=30&granularity=day&tz=Asia/Kolkata
//
// The single endpoint behind every chart on every view. Fifteen chart-specific
// endpoints would each need their own cache key, rate limit, validation and
// tests; one parameterised endpoint gets one of each, and react-query dedupes
// the overlapping requests a shared filter bar produces.
//
// The schema caps accountIds x metrics at 40, which bounds the worst-case
// fan-out to 40 indexed range scans.
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, seriesQuerySchema);

  // Ownership before anything else. With no RLS this is the only barrier
  // between tenants, and it must reject the whole batch if even one id is
  // someone else's.
  await assertOwnedAccounts(auth.userId, q.accountIds);

  const version = await userVersion(auth.userId);
  const cacheKey = keys.series(
    auth.userId,
    version,
    q.accountIds,
    q.metrics,
    String(q.range),
    q.granularity,
    q.tz,
  );

  const payload = await cached(cacheKey, CACHE_TTL, async () => {
    const accounts = await loadAccounts(auth.userId, q.accountIds);
    const now = new Date();
    const { from, to } = rangeBounds(q.range, now);

    // The comparison overlay is the same window shifted back by its own length,
    // so the two lines are always equal-length and directly comparable.
    const span = to.getTime() - from.getTime();
    const prev = { from: new Date(from.getTime() - span), to: from };

    const series = [];
    for (const account of accounts) {
      for (const metric of q.metrics) {
        series.push(await loadSeries(account, metric, from, to, q.granularity, q.tz));
        if (q.compare === "previous") {
          const previous = await loadSeries(account, metric, prev.from, prev.to, q.granularity, q.tz);
          series.push({ ...previous, accountId: `${account.id}:previous` });
        }
      }
    }

    return {
      range: { from: from.toISOString(), to: to.toISOString(), granularity: q.granularity, tz: q.tz },
      series,
    };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:series:${auth.userId}`, max: 120, windowSec: 60 },
});
