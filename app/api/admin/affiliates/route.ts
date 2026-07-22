import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { affiliateQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/affiliates?page&limit&status&search
// Paginated; per-affiliate referral count + commission totals come from one
// count select and one groupBy over the page's ids — previously this endpoint
// fanned out EVERY referral and commission row for EVERY affiliate.
// search matches code / affiliate's name / affiliate's email, case-insensitive.
export const GET = withAdmin(async (req) => {
  const { page, limit, status, search } = parseQuery(req, affiliateQuerySchema);

  const where: Prisma.AffiliateWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
            { user: { name: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.affiliate.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { referrals: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.affiliate.count({ where }),
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
