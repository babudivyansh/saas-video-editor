import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAdmin } from "@/lib/admin/api";

// ?filter= narrows the list to accounts that need a particular kind of support.
const FILTERS: Record<string, Prisma.UserWhereInput> = {
  suspended: { suspendedAt: { not: null } },
  deactivated: { deactivatedAt: { not: null } },
  unverified: { emailVerifiedAt: null },
  "2fa": { twoFactorEnabled: true },
  admins: { role: "ADMIN" },
  // "subscribed" is built per request below (it compares against now).
};

export const GET = withAdmin(async (req) => {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const filter = searchParams.get("filter") ?? "";
  const page   = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const skip   = (page - 1) * limit;

  const where: Prisma.UserWhereInput = {
    ...(search
      ? { OR: [{ email: { contains: search, mode: "insensitive" as const } }, { name: { contains: search, mode: "insensitive" as const } }] }
      : {}),
    ...(filter === "subscribed"
      ? { subscriptionEndsAt: { gt: new Date() }, planId: { not: null } }
      : FILTERS[filter] ?? {}),
  };

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
        plan: { select: { id: true, name: true, slug: true } },
        _count: { select: { projects: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ users, total, page, limit });
});
