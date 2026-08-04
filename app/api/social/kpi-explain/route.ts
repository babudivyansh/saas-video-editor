import type { NextRequest } from "next/server";
import { assertOwnedAccount, ok, parseQuery, withSocial } from "@/lib/social/api";
import { kpiExplainQuerySchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { NotFoundError } from "@/lib/social/api";
import { rangeBounds } from "@/lib/social/metrics";
import { assembleKpiFactsheet } from "@/lib/social/ai/assemble";
import { deterministicKpiExplanation, explainKpi, kpiExplainCacheKey } from "@/lib/social/ai/kpi-explain";
import { runCharged } from "@/lib/social/ai/charge";
import { cached } from "@/lib/social/cache";
import type { KpiExplanation } from "@/lib/social/ai/schemas";

// GET /api/social/kpi-explain?accountId=…&metric=views&range=30&tz=…
//
// "Why did this move?" for one tile. Free, and mostly answered without a model
// at all: the deterministic template handles unavailable metrics, missing data,
// flat periods and movements that track a driver, which is most of them. Only
// the genuinely unexplained ones reach Gemini, cached 24h under a key built
// from ROUNDED deltas so an idle dashboard never re-calls.
const EXPLAIN_CACHE_TTL = 86_400;

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, kpiExplainQuerySchema);
  await assertOwnedAccount(auth.userId, q.accountId);

  // assertOwnedAccount returns the raw row; the assembler wants the read-side
  // context shape, which loadAccounts builds (and which omits token columns).
  const [account] = await loadAccounts(auth.userId, [q.accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const { from, to } = rangeBounds(q.range, new Date());
  const { facts, input } = await assembleKpiFactsheet(account, q.metric, { from, to, tz: q.tz });

  const template = deterministicKpiExplanation(input);
  if (template) return ok({ explanation: template, source: "computed" as const });

  const explanation = await cached<KpiExplanation>(
    kpiExplainCacheKey(account.id, input),
    EXPLAIN_CACHE_TTL,
    () =>
      runCharged(
        {
          userId: auth.userId,
          toolSlug: "social-kpi-explain",
          // Rounded, like the cache key: the same dashboard asking twice in a
          // day is one logical request.
          idempotencyKey: `social-kpi-explain:${account.id}:${q.metric}:${Math.round(input.kpi.deltaPct ?? 0)}:${to.toISOString().slice(0, 10)}`,
          description: `explain ${q.metric} for ${account.provider} account`,
        },
        () => explainKpi(facts, q.metric),
      ),
  );

  return ok({ explanation, source: "model" as const });
}, {
  rateLimit: { key: (auth) => `social:kpi-explain:${auth.userId}`, max: 60, windowSec: 60 },
});
