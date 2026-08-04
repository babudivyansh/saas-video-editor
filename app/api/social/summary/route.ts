import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  HttpError, NotFoundError, assertOwnedAccount, ok, parseBody, parseQuery, withSocial,
} from "@/lib/social/api";
import { summaryBodySchema, accountIdSchema, periodSchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { isoWeekKey, periodBounds } from "@/lib/social/metrics";
import { assembleAccountFactsheet } from "@/lib/social/ai/assemble";
import { generateExecutiveSummary } from "@/lib/social/ai/executive-summary";
import { runCharged } from "@/lib/social/ai/charge";
import { invalidateAccount } from "@/lib/social/cache";
import { z } from "zod";

// GET  /api/social/summary?accountId=…&period=monthly  → the stored summary
// POST /api/social/summary { accountId, period }       → generate one
//
// Weekly is the auto summary the existing insights route already produces, so
// it keeps that route's 6-day freshness gate. Monthly, quarterly and annual are
// on demand and credit-gated.
const FRESH_MS: Record<string, number> = {
  weekly: 6 * 86_400_000,
  monthly: 27 * 86_400_000,
  quarterly: 85 * 86_400_000,
  annual: 350 * 86_400_000,
};

const kindOf = (period: string) => `executive_summary_${period}`;

const querySchema = z.object({ accountId: accountIdSchema, period: periodSchema.default("weekly") });

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, querySchema);
  await assertOwnedAccount(auth.userId, q.accountId);

  const summary = await prisma.aiInsight.findFirst({
    where: { accountId: q.accountId, kind: kindOf(q.period) },
    orderBy: { createdAt: "desc" },
  });
  return ok({ summary });
}, {
  rateLimit: { key: (auth) => `social:summary:get:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, summaryBodySchema);
  await assertOwnedAccount(auth.userId, body.accountId);

  const [account] = await loadAccounts(auth.userId, [body.accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const kind = kindOf(body.period);
  const existing = await prisma.aiInsight.findFirst({
    where: { accountId: account.id, kind },
    orderBy: { createdAt: "desc" },
  });
  // A fresh-enough summary is returned as-is and NOT charged, so a double click
  // or a retry costs nothing.
  if (existing && Date.now() - existing.createdAt.getTime() < FRESH_MS[body.period]) {
    return ok({ summary: existing, cached: true });
  }

  const now = new Date();
  const { from, to } = periodBounds(body.period, now, body.tz);
  const { facts, postCount } = await assembleAccountFactsheet(
    account,
    body.period,
    { from, to, tz: body.tz },
    now,
  );
  if (postCount === 0) {
    throw new HttpError(409, "Not enough data yet — sync some posts first.", "insufficient_data");
  }

  const summary = await runCharged(
    {
      userId: auth.userId,
      toolSlug: "social-exec-report",
      // The period's own identity, so retries within it are one charge. The
      // weekly key is a real ISO week, not a sliced date — the old insights
      // route labelled a yyyy-mm-dd "week", which made every day a new week.
      idempotencyKey: `social-exec:${account.id}:${body.period}:${
        body.period === "weekly" ? isoWeekKey(now, body.tz) : from.toISOString().slice(0, 10)
      }`,
      description: `${body.period} executive summary for ${account.provider} account`,
    },
    async () => {
      const content = await generateExecutiveSummary(facts, body.period);
      return prisma.aiInsight.create({
        data: { accountId: account.id, kind, content: content as object, periodStart: from, periodEnd: to },
      });
    },
  );

  await invalidateAccount(account.id, auth.userId);
  return ok({ summary }, { status: 201 });
}, {
  rateLimit: { key: (auth) => `social:summary:${auth.userId}`, max: 10, windowSec: 3600 },
});
