import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/tool-config";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { redemptions: true } } },
  });
  return NextResponse.json({ coupons });
}

const VALID_TYPES = ["percent", "fixed"];
const VALID_TARGETS = ["all", "subscription", "pack"];

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code || !/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return NextResponse.json({ error: "Code must be 3–32 chars (A–Z, 0–9, - or _)." }, { status: 400 });
  }

  const discountType = VALID_TYPES.includes(body.discountType) ? body.discountType : "percent";
  const discountValue = Number(body.discountValue);
  if (!Number.isInteger(discountValue) || discountValue <= 0) {
    return NextResponse.json({ error: "Discount value must be a positive integer." }, { status: 400 });
  }
  if (discountType === "percent" && discountValue > 100) {
    return NextResponse.json({ error: "Percentage discount can't exceed 100." }, { status: 400 });
  }

  const appliesTo = VALID_TARGETS.includes(body.appliesTo) ? body.appliesTo : "all";

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) return NextResponse.json({ error: "A coupon with this code already exists." }, { status: 409 });

  const coupon = await prisma.coupon.create({
    data: {
      code,
      description: body.description ? String(body.description) : null,
      discountType,
      discountValue,
      appliesTo,
      planSlugs: Array.isArray(body.planSlugs) ? body.planSlugs.map(String) : [],
      minAmountInPaise: Number.isInteger(body.minAmountInPaise) ? body.minAmountInPaise : 0,
      maxRedemptions: body.maxRedemptions != null && body.maxRedemptions !== "" ? Number(body.maxRedemptions) : null,
      perUserLimit: Number.isInteger(body.perUserLimit) ? body.perUserLimit : 1,
      firstPurchaseOnly: Boolean(body.firstPurchaseOnly),
      featured: Boolean(body.featured),
      active: body.active != null ? Boolean(body.active) : true,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    },
  });

  await writeAuditLog({ adminId: admin.userId, action: "coupon.created", targetId: coupon.id, after: coupon });
  return NextResponse.json({ coupon });
}
