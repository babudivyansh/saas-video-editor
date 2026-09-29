import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MIN_PAYOUT_AMOUNT } from "@/lib/affiliate-constants";
import { notifyAdminsIfPayoutEligible } from "@/lib/affiliate";
import { logger } from "@/lib/logger";
import { auditEvent, auditIp } from "@/lib/admin/audit";

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

  // A USER action in the audit log so admins see the request, attributed to
  // the affiliate rather than presented as if an admin did it.
  await auditEvent({
    actorId: user.userId,
    actorType: "user",
    action: "affiliate.payout_requested",
    targetId: affiliate.id,
    after: { amount: availableAmount, affiliateCode: affiliate.code },
    ip: auditIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    sessionId: user.sessionId,
  });

  // Defensive: covers the rare case where balance crossed the threshold
  // without going through the sweep or an admin release (e.g. the dedupe
  // flag was reset by a prior payout but this is the first trigger since).
  await notifyAdminsIfPayoutEligible(affiliate.id, "requested").catch((e) =>
    logger.error("affiliate/payout-request", `admin notify failed for affiliate ${affiliate.id}`, e),
  );

  return NextResponse.json({ success: true, amount: availableAmount });
}
