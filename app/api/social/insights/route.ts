import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getToolConfig } from "@/lib/tool-config";
import { HttpError, assertOwnedAccount, parseBody, parseQuery, withSocial } from "@/lib/social/api";
import { accountIdSchema } from "@/lib/social/schemas";
import { generateInsight } from "@/lib/social/insights";
import { runCharged } from "@/lib/social/ai/charge";
import { isoWeekKey } from "@/lib/social/metrics";

// AI insights for one owned account.
//   GET  ?accountId=…   → the latest stored insight (if any)
//   POST { accountId }  → generate this week's insight (credit-gated)
//
// v1's endpoint. The generator behind it is now the v2 weekly executive summary
// (lib/social/insights.ts is a thin adapter), and the charge/refund path is the
// shared runCharged — this route's hand-written version was the original that
// the shared one was extracted from.
//
// One insight per account per 7 days: a fresh-enough insight is returned as-is
// without charging, so retries and double-clicks stay free.
const FRESH_MS = 6 * 86_400_000;

export const GET = withSocial(async (req: NextRequest, { auth }) => {
  const q = parseQuery(req, z.object({ accountId: accountIdSchema }));
  await assertOwnedAccount(auth.userId, q.accountId);

  const insight = await prisma.aiInsight.findFirst({
    where: { accountId: q.accountId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, content: true, periodStart: true, periodEnd: true, createdAt: true },
  });
  const cost = (await getToolConfig("social-insights")).creditCost;
  return NextResponse.json({ insight, cost });
}, {
  rateLimit: { key: (auth) => `social:insights:${auth.userId}`, max: 60, windowSec: 60 },
});

export const POST = withSocial(async (req: NextRequest, { auth }) => {
  const body = await parseBody(req, z.object({ accountId: accountIdSchema }));
  const account = await assertOwnedAccount(auth.userId, body.accountId);

  const existing = await prisma.aiInsight.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });
  if (existing && Date.now() - existing.createdAt.getTime() < FRESH_MS) {
    return NextResponse.json({ insight: existing, cached: true });
  }

  const postCount = await prisma.socialPost.count({ where: { accountId: account.id } });
  if (postCount === 0) {
    throw new HttpError(409, "Not enough data yet — sync some posts first.", "insufficient_data");
  }

  const insight = await runCharged(
    {
      userId: auth.userId,
      toolSlug: "social-insights",
      // A real ISO week. This used to be a sliced yyyy-mm-dd labelled "week",
      // which made every calendar day its own week and the key useless for the
      // one thing it exists to do.
      idempotencyKey: `social-insights:${account.id}:${isoWeekKey(new Date())}`,
      description: `weekly insight for ${account.provider} account`,
    },
    async () => {
      const content = await generateInsight(account.id, auth.userId);
      const periodEnd = new Date();
      return prisma.aiInsight.create({
        data: {
          accountId: account.id,
          kind: "weekly_summary",
          content: content as object,
          periodStart: new Date(periodEnd.getTime() - 7 * 86_400_000),
          periodEnd,
        },
      });
    },
  );

  return NextResponse.json({ insight }, { status: 201 });
}, {
  rateLimit: { key: (auth) => `social:insights:write:${auth.userId}`, max: 20, windowSec: 3600 },
});
