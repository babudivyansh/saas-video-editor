import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/tool-config";

const VALID_TYPES = ["percent", "fixed"];
const VALID_TARGETS = ["all", "subscription", "pack"];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if ("description" in body) data.description = body.description ? String(body.description) : null;
  if ("discountType" in body && VALID_TYPES.includes(body.discountType)) data.discountType = body.discountType;
  if ("discountValue" in body) {
    const v = Number(body.discountValue);
    if (!Number.isInteger(v) || v <= 0) return NextResponse.json({ error: "Discount value must be a positive integer." }, { status: 400 });
    data.discountValue = v;
  }
  if ("appliesTo" in body && VALID_TARGETS.includes(body.appliesTo)) data.appliesTo = body.appliesTo;
  if ("planSlugs" in body) data.planSlugs = Array.isArray(body.planSlugs) ? body.planSlugs.map(String) : [];
  if ("minAmountInPaise" in body) data.minAmountInPaise = Number(body.minAmountInPaise) || 0;
  if ("maxRedemptions" in body) data.maxRedemptions = body.maxRedemptions != null && body.maxRedemptions !== "" ? Number(body.maxRedemptions) : null;
  if ("perUserLimit" in body) data.perUserLimit = Number(body.perUserLimit) || 1;
  if ("firstPurchaseOnly" in body) data.firstPurchaseOnly = Boolean(body.firstPurchaseOnly);
  if ("featured" in body) data.featured = Boolean(body.featured);
  if ("active" in body) data.active = Boolean(body.active);
  if ("expiresAt" in body) data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  // Guard percent ceiling if either type or value changed.
  const effectiveType = (data.discountType as string) ?? undefined;
  if ((effectiveType === "percent" || (!effectiveType && data.discountValue)) && typeof data.discountValue === "number" && data.discountValue > 100) {
    const current = await prisma.coupon.findUnique({ where: { id }, select: { discountType: true } });
    if ((effectiveType ?? current?.discountType) === "percent") {
      return NextResponse.json({ error: "Percentage discount can't exceed 100." }, { status: 400 });
    }
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const before = await prisma.coupon.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const coupon = await prisma.coupon.update({ where: { id }, data });
  await writeAuditLog({ adminId: admin.userId, action: "coupon.updated", targetId: id, before, after: data });
  return NextResponse.json({ coupon });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const before = await prisma.coupon.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  // Soft-deactivate (keep redemption history intact).
  await prisma.coupon.update({ where: { id }, data: { active: false } });
  await writeAuditLog({ adminId: admin.userId, action: "coupon.deactivated", targetId: id, before });
  return NextResponse.json({ success: true });
}
