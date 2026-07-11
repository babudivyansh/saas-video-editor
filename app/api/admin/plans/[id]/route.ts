import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/tool-config";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = String(body.name).trim();
  if ("priceInPaise" in body) data.priceInPaise = Number(body.priceInPaise);
  if ("credits" in body) data.credits = Number(body.credits);
  if ("currency" in body) data.currency = String(body.currency);
  if ("features" in body) data.features = Array.isArray(body.features) ? body.features : [];
  if ("active" in body) data.active = Boolean(body.active);
  if ("sortOrder" in body) data.sortOrder = Number(body.sortOrder);
  if ("kind" in body) data.kind = String(body.kind);
  if ("intervalMonths" in body) data.intervalMonths = body.intervalMonths != null ? Number(body.intervalMonths) : null;
  if ("monthlyCredits" in body) data.monthlyCredits = body.monthlyCredits != null ? Number(body.monthlyCredits) : null;
  if ("tier" in body) data.tier = body.tier != null ? String(body.tier) : null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const before = await prisma.plan.findUnique({ where: { id } });
  const plan = await prisma.plan.update({ where: { id }, data });

  await writeAuditLog({ adminId: admin.userId, action: "plan.updated", targetId: id, before, after: data });

  return NextResponse.json({ plan });
}

// Soft-delete by deactivating so historical purchases keep their plan reference.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const plan = await prisma.plan.update({ where: { id }, data: { active: false } });

  await writeAuditLog({ adminId: admin.userId, action: "plan.deactivated", targetId: id, after: { active: false } });

  return NextResponse.json({ plan });
}
