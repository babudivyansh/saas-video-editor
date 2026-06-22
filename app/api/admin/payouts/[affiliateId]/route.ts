import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { role: true } });
  return dbUser?.role === "ADMIN" ? user : null;
}

// POST /api/admin/payouts/[affiliateId]  body: { payoutRef: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ affiliateId: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { affiliateId } = await params;
  const { payoutRef } = await req.json();

  if (!payoutRef?.trim()) {
    return NextResponse.json({ error: "payoutRef is required" }, { status: 400 });
  }

  const availableCommissions = await prisma.commission.findMany({
    where: { affiliateId, status: "available" },
  });

  if (availableCommissions.length === 0) {
    return NextResponse.json({ error: "No available commissions to pay out" }, { status: 400 });
  }

  const totalPaid = availableCommissions.reduce((s, c) => s + c.amount, 0);
  const now = new Date();

  await prisma.$transaction([
    prisma.commission.updateMany({
      where: { affiliateId, status: "available" },
      data: { status: "paid", paidAt: now, payoutRef },
    }),
    prisma.affiliate.update({
      where: { id: affiliateId },
      data: { totalPaid: { increment: totalPaid } },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      adminId: admin.userId,
      action: "affiliate.paid",
      targetId: affiliateId,
      after: JSON.stringify({ amount: totalPaid, payoutRef, commissions: availableCommissions.length }),
    },
  });

  return NextResponse.json({ success: true, amount: totalPaid, commissions: availableCommissions.length });
}
