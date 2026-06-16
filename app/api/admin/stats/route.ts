import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [users, videos, rendering, plans, creditsAgg, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.project.count({ where: { status: "completed" } }),
    prisma.project.count({ where: { status: "rendering" } }),
    prisma.plan.count({ where: { active: true } }),
    prisma.user.aggregate({ _sum: { credits: true } }),
    prisma.purchase.aggregate({ _sum: { amountInPaise: true }, _count: true }),
  ]);

  return NextResponse.json({
    stats: {
      users,
      videosRendered: videos,
      rendering,
      activePlans: plans,
      creditsOutstanding: creditsAgg._sum.credits ?? 0,
      revenueInPaise: revenueAgg._sum.amountInPaise ?? 0,
      purchaseCount: revenueAgg._count,
    },
  });
}
