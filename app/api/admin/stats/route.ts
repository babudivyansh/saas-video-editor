import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  sixMonthsAgo.setHours(0, 0, 0, 0);

  const [
    users, videos, rendering, plans,
    creditsAgg, revenueAgg,
    failedRenders, activeSubscribers,
    recentPurchases, byPlan, byProductType,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count({ where: { status: "completed" } }),
    prisma.project.count({ where: { status: "rendering" } }),
    prisma.plan.count({ where: { active: true } }),
    prisma.user.aggregate({ _sum: { credits: true } }),
    prisma.purchase.aggregate({ _sum: { amountInPaise: true }, _count: true }),
    prisma.project.count({ where: { status: "failed" } }),
    prisma.user.count({ where: { subscriptionEndsAt: { gt: new Date() } } }),
    // All purchases in last 6 months for monthly grouping
    prisma.purchase.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { amountInPaise: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    // Revenue grouped by plan
    prisma.purchase.groupBy({
      by: ["planId"],
      _sum: { amountInPaise: true },
      _count: true,
      orderBy: { _sum: { amountInPaise: "desc" } },
      take: 10,
    }),
    // Projects grouped by productType
    prisma.project.groupBy({
      by: ["productType"],
      _count: true,
      orderBy: { _count: { productType: "desc" } },
    }),
  ]);

  // Build monthly buckets for the last 6 months
  const monthlyMap: Record<string, number> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[key] = 0;
  }
  for (const p of recentPurchases) {
    const d = new Date(p.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (key in monthlyMap) monthlyMap[key] += p.amountInPaise;
  }
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthlyRevenue = Object.entries(monthlyMap).map(([key, revenue]) => {
    const [y, m] = key.split("-");
    return { month: `${monthNames[parseInt(m, 10) - 1]} ${y}`, revenue };
  });

  // Resolve plan names for by-plan breakdown
  const planIds = byPlan.map(r => r.planId).filter(Boolean) as string[];
  const planNames = planIds.length
    ? await prisma.plan.findMany({ where: { id: { in: planIds } }, select: { id: true, name: true, slug: true } })
    : [];
  const planNameMap = Object.fromEntries(planNames.map(p => [p.id, p.name]));

  const revenueByPlan = byPlan.map(r => ({
    planId: r.planId ?? "unknown",
    planName: (r.planId ? planNameMap[r.planId] : null) ?? "Unknown",
    revenue: r._sum.amountInPaise ?? 0,
    count: r._count,
  }));

  const toolUsage = byProductType.map(r => ({ productType: r.productType, count: r._count }));

  return NextResponse.json({
    stats: {
      users,
      videosRendered: videos,
      rendering,
      activePlans: plans,
      creditsOutstanding: creditsAgg._sum.credits ?? 0,
      revenueInPaise: revenueAgg._sum.amountInPaise ?? 0,
      purchaseCount: revenueAgg._count,
      failedRenders,
      activeSubscribers,
    },
    monthlyRevenue,
    revenueByPlan,
    toolUsage,
  });
}
