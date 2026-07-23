import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";
import { notifyAdminsIfPayoutEligible } from "@/lib/affiliate";
import { logger } from "@/lib/logger";

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

  if (availableAmount < MIN_PAYOUT_AMOUNT) {
    return NextResponse.json(
      { error: `Minimum payout is ₹${MIN_PAYOUT_AMOUNT}. You have ₹${availableAmount.toFixed(2)} available.` },
      { status: 400 }
    );
  }

  await prisma.affiliate.update({ where: { id: affiliate.id }, data: { payoutRequestedAt: new Date() } });

  // Log a payout request in AuditLog so admin can see it
  await prisma.auditLog.create({
    data: {
      adminId: user.userId,
      action: "affiliate.payout_requested",
      targetId: affiliate.id,
      after: JSON.stringify({ amount: availableAmount, affiliateCode: affiliate.code }),
    },
  });

  // Defensive: covers the rare case where balance crossed the threshold
  // without going through the sweep or an admin release (e.g. the dedupe
  // flag was reset by a prior payout but this is the first trigger since).
  await notifyAdminsIfPayoutEligible(affiliate.id, "requested").catch((e) =>
    logger.error("affiliate/payout-request", `admin notify failed for affiliate ${affiliate.id}`, e),
  );

  return NextResponse.json({ success: true, amount: availableAmount });
}
