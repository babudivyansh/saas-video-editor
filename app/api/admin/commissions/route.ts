import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { pageQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/commissions?status=&page=&limit=
// Paginated (the nested includes are fine once bounded to ≤200 rows).
export const GET = withAdmin(async (req) => {
  const { page, limit, status } = parseQuery(req, pageQuerySchema);

  const where = status ? { status } : undefined;
  const [commissions, total] = await Promise.all([
    prisma.commission.findMany({
      where,
      include: {
        affiliate: { include: { user: { select: { name: true, email: true } } } },
        referral: { include: { referredUser: { select: { name: true, email: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.commission.count({ where }),
  ]);

  return NextResponse.json({ commissions, total, page, limit });
});
