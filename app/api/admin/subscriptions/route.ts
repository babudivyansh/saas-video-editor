import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { subscriptionsQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/subscriptions?page&limit&search — active subscribers,
// paginated, optionally filtered by email/name (UX-7 — this table had no
// search at all, unlike the otherwise-identical Users page).
// Response keys are additive over the old shape ({ subscribers, total }).
export const GET = withAdmin(async (req) => {
  const { page, limit, search } = parseQuery(req, subscriptionsQuerySchema);
  const now = new Date();
  const where = {
    subscriptionEndsAt: { gt: now },
    ...(search
      ? { OR: [{ email: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] }
      : {}),
  };

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
