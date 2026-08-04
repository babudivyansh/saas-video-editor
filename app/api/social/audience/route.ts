import type { NextRequest } from "next/server";
import { z } from "zod";
import { assertOwnedAccounts, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, userVersion } from "@/lib/social/cache";
import { accountIdsSchema, timezoneSchema } from "@/lib/social/schemas";
import { loadAccounts, loadAudience } from "@/lib/social/queries";
import { capabilityMap } from "@/lib/social/capabilities";
import { computeBestTimes, rankedTimeSlots } from "@/lib/social/metrics";
import { prisma } from "@/lib/prisma";

// GET /api/social/audience?accountIds=a,b&sinceDays=45&tz=Asia/Kolkata
//
// Demographics plus posting-time performance for the selected accounts.
//
// `sinceDays` defaults to 45 rather than to "latest capture": providers refresh
// demographics weekly at best, and several skip a week entirely, so a stricter
// window renders an empty Audience tab for accounts that have perfectly good
// data from nine days ago.
const DEFAULT_SINCE_DAYS = 45;
const POSTS_FOR_TIMING = 200;

const querySchema = z.object({
  accountIds: accountIdsSchema.optional(),
  sinceDays: z.coerce.number().int().min(7).max(365).default(DEFAULT_SINCE_DAYS),
  tz: timezoneSchema,
});

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, querySchema);
  if (q.accountIds?.length) await assertOwnedAccounts(auth.userId, q.accountIds);

  const version = await userVersion(auth.userId);
  const cacheKey = `${keys.audience(auth.userId, version)}:${q.accountIds?.join(",") ?? "all"}:${q.sinceDays}:${q.tz}`;

  const payload = await cached(cacheKey, CACHE_TTL, async () => {
    const accounts = await loadAccounts(auth.userId, q.accountIds);
    const since = new Date(Date.now() - q.sinceDays * 86_400_000);

    const sections = await Promise.all(
      accounts.map(async (account) => {
        const tz = account.timezone ?? q.tz;
        const [audience, posts] = await Promise.all([
          loadAudience(account.id, since),
          prisma.socialPost.findMany({
            where: { accountId: account.id, publishedAt: { not: null } },
            orderBy: { publishedAt: "desc" },
            take: POSTS_FOR_TIMING,
            select: {
              id: true, publishedAt: true, views: true, reach: true,
              likes: true, comments: true, shares: true, saves: true,
            },
          }),
        ]);

        const bestTimes = computeBestTimes(posts, tz);
        return {
          accountId: account.id,
          provider: account.provider,
          label: account.displayName ?? account.username ?? account.provider,
          capabilities: capabilityMap(account.provider, account.observed),
          capturedAt: audience.capturedAt?.toISOString() ?? null,
          rows: audience.rows,
          bestTimes: bestTimes.cells,
          topSlots: rankedTimeSlots(bestTimes),
          timezone: tz,
        };
      }),
    );

    return { accounts: sections, sinceDays: q.sinceDays };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:audience:${auth.userId}`, max: 60, windowSec: 60 },
});
