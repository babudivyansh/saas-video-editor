import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { pageQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/affiliates?page&limit
// Paginated; per-affiliate referral count + commission totals come from one
// count select and one groupBy over the page's ids — previously this endpoint
// fanned out EVERY referral and commission row for EVERY affiliate.
export const GET = withAdmin(async (req) => {
  const { page, limit } = parseQuery(req, pageQuerySchema);

  const [rows, total] = await Promise.all([
    prisma.affiliate.findMany({
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { referrals: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.affiliate.count(),
  ]);

  const ids = rows.map((a) => a.id);
  const [totals, referralsByStatus] = await Promise.all([
    prisma.commission.groupBy({
      by: ["affiliateId", "status"],
      where: { affiliateId: { in: ids } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.referral.groupBy({
      by: ["affiliateId", "status"],
      where: { affiliateId: { in: ids } },
      _count: true,
    }),
  ]);

  const affiliates = rows.map((a) => {
    const mine = totals.filter((t) => t.affiliateId === a.id);
    const sum = (status: string) => mine.find((t) => t.status === status)?._sum.amount ?? 0;
    return {
      ...a,
      referralCount: a._count.referrals,
      convertedReferrals:
        referralsByStatus.find((r) => r.affiliateId === a.id && r.status === "converted")?._count ?? 0,
      commissionTotals: {
        pending: sum("pending"),
        available: sum("available"),
        paid: sum("paid"),
        rejected: sum("rejected"),
        count: mine.reduce((s, t) => s + t._count, 0),
      },
    };
  });

  return NextResponse.json({ affiliates, total, page, limit });
});
