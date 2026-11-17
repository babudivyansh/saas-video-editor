import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { usageDisplayName, listCreditCost, minuteSpendsSince } from "@/lib/billing/usage";

// Real usage for the billing Usage tab: credits from the Generation ledger and
// Clip Minutes from the MinuteTransaction ledger (lib/billing/usage.ts). No
// Redis caching: usage changes on every generation and staleness would
// undermine trust on a billing surface.

const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

interface ModelRow {
  modelId: string | null;
  toolSlug: string;
  displayName: string;
  count: number;
  creditsCost: number;
  minutesCost: number;
  /** The tool's list price; 0 = a free tool. */
  listCreditCost: number | null;
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rangeParam = req.nextUrl.searchParams.get("range") ?? "30d";
  const days = RANGE_DAYS[rangeParam] ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);

  const activeStatuses = ["completed", "pending"] as const;

  const [byModelGroups, rows, minuteSpends] = await Promise.all([
    prisma.generation.groupBy({
      by: ["modelId", "toolSlug"],
      where: { userId: auth.userId, createdAt: { gte: since }, status: { in: [...activeStatuses] } },
      _sum: { creditsCost: true },
      _count: true,
    }),
    prisma.generation.findMany({
      where: { userId: auth.userId, createdAt: { gte: since }, status: { in: [...activeStatuses] } },
      select: { creditsCost: true, createdAt: true, toolSlug: true },
    }),
    minuteSpendsSince(auth.userId, since),
  ]);

  const totalCreditsUsed = rows.reduce((sum, r) => sum + r.creditsCost, 0);
  const totalMinutesUsed = minuteSpends.reduce((sum, s) => sum + s.minutes, 0);

  const byModel: ModelRow[] = byModelGroups.map(g => ({
    modelId: g.modelId,
    toolSlug: g.toolSlug,
    displayName: usageDisplayName(g.modelId, g.toolSlug),
    count: g._count,
    creditsCost: g._sum.creditsCost ?? 0,
    minutesCost: 0,
    listCreditCost: listCreditCost(g.toolSlug),
  }));

  // Fold minutes into the tool's row. Auto Clip already has Generation rows
  // (one per charged run); a minute-only feature such as editor captions has
  // none, so it gets a row of its own counted by spends.
  const minutesByTool = new Map<string, { minutes: number; runs: number }>();
  for (const s of minuteSpends) {
    const prev = minutesByTool.get(s.toolSlug) ?? { minutes: 0, runs: 0 };
    minutesByTool.set(s.toolSlug, { minutes: prev.minutes + s.minutes, runs: prev.runs + 1 });
  }
  for (const [toolSlug, m] of minutesByTool) {
    const row = byModel.find(r => r.toolSlug === toolSlug);
    if (row) row.minutesCost += m.minutes;
    else byModel.push({
      modelId: null, toolSlug, displayName: usageDisplayName(null, toolSlug),
      count: m.runs, creditsCost: 0, minutesCost: m.minutes, listCreditCost: listCreditCost(toolSlug),
    });
  }
  byModel.sort((a, b) => (b.minutesCost - a.minutesCost) || (b.creditsCost - a.creditsCost) || (b.count - a.count));

  const byToolMap = new Map<string, { count: number; creditsCost: number; minutesCost: number }>();
  for (const r of byModel) {
    const prev = byToolMap.get(r.toolSlug) ?? { count: 0, creditsCost: 0, minutesCost: 0 };
    byToolMap.set(r.toolSlug, {
      count: prev.count + r.count,
      creditsCost: prev.creditsCost + r.creditsCost,
      minutesCost: prev.minutesCost + r.minutesCost,
    });
  }
  const byTool = [...byToolMap.entries()]
    .map(([toolSlug, v]) => ({ toolSlug, ...v }))
    .sort((a, b) => (b.minutesCost - a.minutesCost) || (b.creditsCost - a.creditsCost));

  // Zero-filled day buckets, done in JS — cheap at this data volume, avoids raw SQL date_trunc.
  const byDay: { date: string; credits: number; minutes: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    const credits = rows
      .filter(r => r.createdAt >= day && r.createdAt < next)
      .reduce((sum, r) => sum + r.creditsCost, 0);
    const minutes = minuteSpends
      .filter(s => s.createdAt >= day && s.createdAt < next)
      .reduce((sum, s) => sum + s.minutes, 0);
    byDay.push({ date: day.toISOString().slice(0, 10), credits, minutes });
  }

  return NextResponse.json({ totalCreditsUsed, totalMinutesUsed, byModel, byDay, byTool });
}
