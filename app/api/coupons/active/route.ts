import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { memoFor } from "@/lib/memo";

const featuredCoupons = memoFor(10_000, () => {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      active: true,
      featured: true,
      // Subscriptions take no coupons (lib/coupons.ts) — never advertise one
      // that checkout would refuse.
      appliesTo: { not: "subscription" },
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
});

// Public: featured, currently-valid coupons for the billing launch banner.
export async function GET() {
  return NextResponse.json({ coupons: await featuredCoupons() });
}
