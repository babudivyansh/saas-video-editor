import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { couponPatchSchema } from "@/lib/admin/schemas";

export const PATCH = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const data = await parseBody(req, couponPatchSchema);

  const before = await prisma.coupon.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  // Cross-field edge the schema can't see: raising the value above 100 on a
  // coupon that is (or stays) percent-typed.
  const effectiveType = data.discountType ?? before.discountType;
  const effectiveValue = data.discountValue ?? before.discountValue;
  if (effectiveType === "percent" && effectiveValue > 100) {
    return NextResponse.json({ error: "Percentage discount can't exceed 100." }, { status: 400 });
  }

  const coupon = await prisma.coupon.update({ where: { id }, data });
  await auditAdminAction(admin.userId, "coupon.updated", id, { before, after: data, ip: auditIp(req) });
  return NextResponse.json({ coupon });
});

export const DELETE = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;

  const before = await prisma.coupon.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  // Soft-deactivate (keep redemption history intact).
  await prisma.coupon.update({ where: { id }, data: { active: false } });
  await auditAdminAction(admin.userId, "coupon.deactivated", id, { before, ip: auditIp(req) });
  return NextResponse.json({ success: true });
});
