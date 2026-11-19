import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";
import { buildUserWhere } from "@/lib/admin/user-filters";

export const GET = withAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip   = (page - 1) * limit;

  // search, filter, journey, joined, method, use, active — lib/admin/user-filters.ts
  const where = buildUserWhere(searchParams);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        email: true,
        name: true,
        credits: true,
        monthlyCredits: true,
        role: true,
        createdAt: true,
        subscriptionEndsAt: true,
        nextRefillAt: true,
        suspendedAt: true,
        deactivatedAt: true,
        emailVerifiedAt: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        hasPassword: true,
        intendedUse: true,
        plan: { select: { id: true, name: true, slug: true } },
        _count: { select: { projects: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, limit });
});
