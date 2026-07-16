import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { pageQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/subscriptions?page&limit — active subscribers, paginated.
// Response keys are additive over the old shape ({ subscribers, total }).
export const GET = withAdmin(async (req) => {
  const { page, limit } = parseQuery(req, pageQuerySchema);
  const now = new Date();
  const where = { subscriptionEndsAt: { gt: now } };

  const [subscribers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { subscriptionEndsAt: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
        monthlyCredits: true,
        subscriptionEndsAt: true,
        nextRefillAt: true,
        plan: { select: { id: true, name: true, slug: true } },
        _count: { select: { purchases: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ subscribers, total, page, limit });
});
