import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public: featured, currently-valid coupons for the billing launch banner.
export async function GET() {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      active: true,
      featured: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      code: true,
      description: true,
      discountType: true,
      discountValue: true,
      appliesTo: true,
      expiresAt: true,
    },
  });

  // Drop any that have hit their global redemption cap.
  return NextResponse.json({ coupons });
}
