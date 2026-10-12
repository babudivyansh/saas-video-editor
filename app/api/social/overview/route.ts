import type { NextRequest } from "next/server";
import { assertOwnedAccounts, ok, parseQuery, withSocial } from "@/lib/social/api";
import { CACHE_TTL, cached, keys, userVersion } from "@/lib/social/cache";
import { overviewQuerySchema } from "@/lib/social/schemas";
import { combinedCapabilities, loadAccountKpis, loadAccounts } from "@/lib/social/queries";
import { comparePlatforms, rangeBounds } from "@/lib/social/metrics";
import { aggregateKpis } from "@/lib/social/aggregate-kpis";

// GET /api/social/overview?accountIds=a,b&range=30&tz=Asia/Kolkata
//
// The executive view: every KPI aggregated across the selected accounts, the
// per-platform split, and account health. This is the question the product
// exists to answer — "how am I doing?" — and until now it could not be asked,
// because analytics were nested per account behind a tab.
export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, overviewQuerySchema);
  if (q.accountIds?.length) await assertOwnedAccounts(auth.userId, q.accountIds);

  const version = await userVersion(auth.userId);
  const cacheKey = `${keys.overview(auth.userId, version)}:${q.accountIds?.join(",") ?? "all"}:${q.range}:${q.tz}`;

  const payload = await cached(cacheKey, CACHE_TTL, async () => {
    const accounts = await loadAccounts(auth.userId, q.accountIds);
    if (accounts.length === 0) {
      return { accounts: [], totals: {}, capabilities: {}, platforms: [], range: null };
    }

    const now = new Date();
    const { from, to } = rangeBounds(q.range, now);
    const perAccount = await Promise.all(accounts.map((a) => loadAccountKpis(a, from, to, a.timezone ?? q.tz)));

    return {
      range: { from: from.toISOString(), to: to.toISOString(), days: q.range, tz: q.tz },
      capabilities: combinedCapabilities(accounts),
      totals: aggregateKpis(perAccount),
      platforms: comparePlatforms(
        accounts.map((a) => ({
          accountId: a.id,
          provider: a.provider,
          label: a.displayName ?? a.username ?? a.provider,
          followers: a.followers,
          engagementRate:
            perAccount.find((p) => p.account.id === a.id)?.kpis.engagementRate.current ?? null,
        })),
      ),
      accounts: perAccount.map((p) => ({
        id: p.account.id,
        provider: p.account.provider,
        username: p.account.username,
        displayName: p.account.displayName,
        avatarUrl: p.account.avatarUrl,
        followers: p.account.followers,
        healthScore: p.account.healthScore,
        // Sync state we already stored and never surfaced: a partial sync used
        // to look identical to a healthy one.
        status: p.account.status,
        lastSyncedAt: p.account.lastSyncedAt?.toISOString() ?? null,
        lastSyncStatus: p.account.lastSyncStatus,
        lastSyncError: p.account.lastSyncError,
        dataCompleteness: p.completeness,
        capabilities: p.capabilities,
        kpis: p.kpis,
        derived: p.derived,
      })),
    };
  });

  return ok(payload);
}, {
  rateLimit: { key: (auth) => `social:overview:${auth.userId}`, max: 60, windowSec: 60 },
});
