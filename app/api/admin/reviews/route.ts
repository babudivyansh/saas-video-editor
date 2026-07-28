import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { reviewListQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/reviews?status=&rating=&feature=&search=&spamMin=&reported=&page=&limit=
export const GET = withAdmin(async (req) => {
  const { page, limit, status, rating, feature, search, spamMin, reported } = parseQuery(req, reviewListQuerySchema);

  const where: Prisma.ReviewWhereInput = {
    ...(status ? { status } : {}),
    ...(rating ? { rating } : {}),
    ...(feature ? { featureUsed: feature } : {}),
    ...(spamMin !== undefined ? { spamScore: { gte: spamMin } } : {}),
    ...(reported ? { reportCount: { gt: 0 } } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { body: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, email: true, name: true } } },
    }),
    prisma.review.count({ where }),
  ]);

  return NextResponse.json({ reviews, total, page, limit });
});
