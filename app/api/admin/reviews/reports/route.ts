import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { pageQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/reviews/reports?status=open&page=&limit= — defaults to open reports.
export const GET = withAdmin(async (req) => {
  const { page, limit, status } = parseQuery(req, pageQuerySchema);

  const where = { status: status ?? "open" };
  const [reports, total] = await Promise.all([
    prisma.reviewReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, email: true, name: true } },
        review: { select: { id: true, title: true, body: true, status: true, rating: true } },
      },
    }),
    prisma.reviewReport.count({ where }),
  ]);

  return NextResponse.json({ reports, total, page, limit });
});
