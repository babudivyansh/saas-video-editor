import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  HttpError, NotFoundError, assertOwnedAccount, ok, parseBody, parseQuery, withSocial,
} from "@/lib/social/api";
import { accountIdSchema, recommendationsBodySchema } from "@/lib/social/schemas";
import { loadAccounts } from "@/lib/social/queries";
import { isoWeekKey, rangeBounds } from "@/lib/social/metrics";
import { assembleContentFactsheet, assembleScheduleFactsheet } from "@/lib/social/ai/assemble";
import { generateContentRecommendations } from "@/lib/social/ai/content-recommendations";
import { generateScheduleSuggestions } from "@/lib/social/ai/schedule-suggestions";
import { runCharged } from "@/lib/social/ai/charge";

// GET  /api/social/recommendations?accountId=…  → the stored set
// POST /api/social/recommendations { accountId } → generate this week's
//
// Content recommendations and schedule suggestions are produced together: they
// answer "what next" from the same posts, and splitting them into two charges
// for what a user experiences as one question would be a fee, not a price.
const KIND = "content_recommendations";

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({ accountId: accountIdSchema }));
  await assertOwnedAccount(auth.userId, q.accountId);

  const recommendations = await prisma.aiInsight.findFirst({
    where: { accountId: q.accountId, kind: KIND },
    orderBy: { createdAt: "desc" },
  });
  return ok({ recommendations });
}, {
  rateLimit: { key: (auth) => `social:recs:get:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, recommendationsBodySchema);
  await assertOwnedAccount(auth.userId, body.accountId);

  const [account] = await loadAccounts(auth.userId, [body.accountId]);
  if (!account) throw new NotFoundError("Account not found");

  const now = new Date();
  const { from, to } = rangeBounds(body.range, now);
  const window = { from, to, tz: body.tz };

  const { facts, postIds } = await assembleContentFactsheet(account, window, now);
  if (postIds.length === 0) {
    throw new HttpError(409, "Not enough data yet — sync some posts first.", "insufficient_data");
  }

  const recommendations = await runCharged(
    {
      userId: auth.userId,
      toolSlug: "social-content-recs",
      idempotencyKey: `social-content-recs:${account.id}:${isoWeekKey(now, body.tz)}`,
      description: `content recommendations for ${account.provider} account`,
    },
    async () => {
      const scheduleFacts = await assembleScheduleFactsheet(account, now, body.tz);
      // One charge, two generations: both are cheap text calls over factsheets
      // already assembled, and the user asked one question.
      const [content, schedule] = await Promise.all([
        generateContentRecommendations(facts),
        generateScheduleSuggestions(scheduleFacts),
      ]);
      return prisma.aiInsight.create({
        data: {
          accountId: account.id,
          kind: KIND,
          content: { ...content, schedule } as object,
          periodStart: from,
          periodEnd: to,
        },
      });
    },
  );

  return ok({ recommendations }, { status: 201 });
}, {
  rateLimit: { key: (auth) => `social:recs:${auth.userId}`, max: 10, windowSec: 3600 },
});
