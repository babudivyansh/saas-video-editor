import { NextRequest, NextResponse } from "next/server";
import { requireSubscriber } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chargeCredits, refundCredits, markGenerationStatus } from "@/lib/credits";
import { getToolConfig } from "@/lib/tool-config";
import { generateInsight } from "@/lib/social/insights";
import { logger } from "@/lib/logger";

// AI insights for one owned account.
//   GET  ?accountId=…       → latest stored insight (if any)
//   POST { accountId }      → generate this week's insight (credit-gated).
// One insight per account per 7 days: a fresh-enough insight is returned
// as-is without charging, so retries and double-clicks stay free.
const FRESH_MS = 6 * 86400_000;

export async function GET(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  const account = await prisma.socialAccount.findFirst({ where: { id: accountId, userId: auth.userId }, select: { id: true } });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const insight = await prisma.aiInsight.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, content: true, periodStart: true, periodEnd: true, createdAt: true },
  });
  const cost = (await getToolConfig("social-insights")).creditCost;
  return NextResponse.json({ insight, cost });
}

export async function POST(req: NextRequest) {
  const auth = await requireSubscriber(req);
  if (!auth) return NextResponse.json({ error: "Social Tracker is available on paid plans." }, { status: 402 });
  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (!body.accountId) return NextResponse.json({ error: "accountId is required" }, { status: 400 });

  const account = await prisma.socialAccount.findFirst({
    where: { id: body.accountId, userId: auth.userId },
    select: { id: true, provider: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const existing = await prisma.aiInsight.findFirst({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
  });
  if (existing && Date.now() - existing.createdAt.getTime() < FRESH_MS) {
    return NextResponse.json({ insight: existing, cached: true });
  }

  const postCount = await prisma.socialPost.count({ where: { accountId: account.id } });
  if (postCount === 0) {
    return NextResponse.json({ error: "Not enough data yet — sync some posts first." }, { status: 409 });
  }

  const cost = (await getToolConfig("social-insights")).creditCost;
  // Week-scoped idempotency: a retried request in the same ISO week never
  // double-charges even if the freshness check races.
  const week = new Date().toISOString().slice(0, 10);
  const charge = await chargeCredits({
    userId: auth.userId,
    toolSlug: "social-insights",
    amount: cost,
    idempotencyKey: `social-insights:${account.id}:${week}`,
    log: { generationType: "utility", prompt: `weekly insight for ${account.provider} account` },
  });
  if (!charge.ok) {
    if (charge.reason === "insufficient_credits") {
      return NextResponse.json({ error: "Not enough credits.", code: "insufficient_credits" }, { status: 402 });
    }
    return NextResponse.json({ error: "Insights are temporarily disabled." }, { status: 503 });
  }

  try {
    const content = await generateInsight(account.id, account.provider);
    const periodEnd = new Date();
    const insight = await prisma.aiInsight.create({
      data: {
        accountId: account.id,
        kind: "weekly_summary",
        content: content as object,
        periodStart: new Date(periodEnd.getTime() - 7 * 86400_000),
        periodEnd,
      },
    });
    if (charge.generationId) await markGenerationStatus(charge.generationId, "completed");
    return NextResponse.json({ insight }, { status: 201 });
  } catch (e) {
    logger.error("social-insights", `generation failed for ${account.id}`, e);
    await refundCredits({ userId: auth.userId, amount: cost, generationId: charge.generationId });
    return NextResponse.json({ error: "Insight generation failed — you were not charged." }, { status: 502 });
  }
}
