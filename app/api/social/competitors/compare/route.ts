import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertOwnedAccounts, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, userVersion } from "@/lib/social/cache";
import { accountIdsSchema, rangeDaysSchema } from "@/lib/social/schemas";
import { loadAccountKpis, loadAccounts } from "@/lib/social/queries";
import { benchmark, compareCompetitors, comparePlatforms, rangeBounds } from "@/lib/social/metrics";

// GET /api/social/competitors/compare?accountIds=a,b&range=30
//
// Us against them, and us against ourselves. Returns three things the old
// competitor list could not answer: where each of our accounts sits against the
// others, where we sit against each tracked competitor ON THE SAME PLATFORM,
// and where our engagement rate sits against the platform's typical band.
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({
    accountIds: accountIdsSchema.optional(),
    range: rangeDaysSchema.default(30),
  }));
  if (q.accountIds?.length) await assertOwnedAccounts(auth.userId, q.accountIds);

  const version = await userVersion(auth.userId);
  const cacheKey = `${keys.compare(auth.userId, version)}:${q.accountIds?.join(",") ?? "all"}:${q.range}`;

  const payload = await cached(cacheKey, CACHE_TTL, async () => {
    const accounts = await loadAccounts(auth.userId, q.accountIds);
    if (accounts.length === 0) return { platforms: [], competitors: [], benchmarks: [] };

    const { from, to } = rangeBounds(q.range, new Date());
    const [perAccount, competitors] = await Promise.all([
      Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? "UTC"))),
      prisma.competitorProfile.findMany({
        where: { userId: auth.userId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, provider: true, handle: true, displayName: true, followers: true,
          snapshots: {
            orderBy: { capturedAt: "desc" },
            take: 2,
            select: { capturedAt: true, followers: true, engagementRate: true, postsPerWeek: true },
          },
        },
      }),
    ]);

    const erOf = (accountId: string) =>
      perAccount.find((p) => p.account.id === accountId)?.kpis.engagementRate.current ?? null;

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days: q.range },

      platforms: comparePlatforms(
        accounts.map((a) => ({
          accountId: a.id,
          provider: a.provider,
          label: a.displayName ?? a.username ?? a.provider,
          followers: a.followers,
          engagementRate: erOf(a.id),
        })),
      ),

      competitors: compareCompetitors(
        accounts.map((a) => ({ provider: a.provider, followers: a.followers })),
        competitors.map((c) => {
          const [latest, previous] = c.snapshots;
          return {
            id: c.id,
            handle: c.displayName ?? c.handle,
            provider: c.provider,
            followers: latest?.followers ?? c.followers,
            engagementRate: latest?.engagementRate ?? null,
            postsPerWeek: latest?.postsPerWeek ?? null,
            // Two snapshots or nothing: a growth figure from a single capture
            // would be a value invented out of one observation.
            weekGrowth:
              latest?.followers != null && previous?.followers != null
                ? latest.followers - previous.followers
                : null,
          };
        }),
      ),

      benchmarks: accounts.map((a) => ({
        accountId: a.id,
        provider: a.provider,
        engagementRate: erOf(a.id),
        ...benchmark(erOf(a.id), a.provider),
      })),
    };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:compare:${auth.userId}`, max: 60, windowSec: 60 },
});
