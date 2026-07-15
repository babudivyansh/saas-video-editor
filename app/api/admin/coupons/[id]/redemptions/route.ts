import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseQuery } from "@/lib/admin/api";
import { pageQuerySchema } from "@/lib/admin/schemas";

// GET /api/admin/coupons/[id]/redemptions?page&limit — who redeemed a coupon,
// when, and for how much discount. The coupons list only shows a count.
export const GET = withAdmin<{ id: string }>(async (req, { params }) => {
  const { id } = params;
  const { page, limit } = parseQuery(req, pageQuerySchema);

  const coupon = await prisma.coupon.findUnique({ where: { id }, select: { id: true, code: true } });
  if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const [rows, total] = await Promise.all([
    prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, userId: true, orderId: true, discountInPaise: true, createdAt: true },
    }),
    prisma.couponRedemption.count({ where: { couponId: id } }),
  ]);

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    code: coupon.code,
    redemptions: rows.map((r) => ({
      ...r,
      user: userById.get(r.userId) ?? { id: r.userId, email: "(deleted user)", name: null },
    })),
    total,
    page,
    limit,
  });
});
