import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { couponCreateSchema } from "@/lib/admin/schemas";

export const GET = withAdmin(async () => {
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return NextResponse.json({ coupons });
});

export const POST = withAdmin(async (req, { admin }) => {
  const body = await parseBody(req, couponCreateSchema);

  const existing = await prisma.coupon.findUnique({ where: { code: body.code } });
  if (existing) return NextResponse.json({ error: "A coupon with this code already exists." }, { status: 409 });

  const coupon = await prisma.coupon.create({
    data: {
      code: body.code,
      description: body.description ?? null,
      discountType: body.discountType ?? "percent",
      discountValue: body.discountValue,
      appliesTo: body.appliesTo ?? "all",
      planSlugs: body.planSlugs ?? [],
      minAmountInPaise: body.minAmountInPaise ?? 0,
      maxRedemptions: body.maxRedemptions ?? null,
      perUserLimit: body.perUserLimit ?? 1,
      firstPurchaseOnly: body.firstPurchaseOnly ?? false,
      featured: body.featured ?? false,
      active: body.active ?? true,
      expiresAt: body.expiresAt ?? null,
    },
  });

  await auditAdminAction(admin.userId, "coupon.created", coupon.id, { after: coupon, ip: auditIp(req) });
  return NextResponse.json({ coupon });
});
