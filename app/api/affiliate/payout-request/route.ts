import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MIN_PAYOUT = 500; // ₹500

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.userId },
    include: { commissions: { where: { status: "available" } } },
  });

  if (!affiliate) {
    return NextResponse.json({ error: "Not enrolled as affiliate" }, { status: 400 });
  }

  const availableAmount = affiliate.commissions.reduce((s, c) => s + c.amount, 0);

  if (availableAmount < MIN_PAYOUT) {
    return NextResponse.json(
      { error: `Minimum payout is ₹${MIN_PAYOUT}. You have ₹${availableAmount.toFixed(2)} available.` },
      { status: 400 }
    );
  }

  // Log a payout request in AuditLog so admin can see it
  await prisma.auditLog.create({
    data: {
      adminId: user.userId,
      action: "affiliate.payout_requested",
      targetId: affiliate.id,
      after: JSON.stringify({ amount: availableAmount, affiliateCode: affiliate.code }),
    },
  });

  return NextResponse.json({ success: true, amount: availableAmount });
}
