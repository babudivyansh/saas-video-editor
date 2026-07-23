import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { payoutSchema } from "@/lib/admin/schemas";

// POST /api/admin/payouts/[affiliateId]  body: { payoutRef: string }
// Sweeps all "available" commissions to "paid" in one transaction. Naturally
// idempotent: a repeat POST finds nothing available and pays out zero.
export const POST = withAdmin<{ affiliateId: string }>(async (req, { admin, params }) => {
  const { affiliateId } = params;
  const { payoutRef } = await parseBody(req, payoutSchema);

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
      data: { totalPaid: { increment: totalPaid }, payoutRequestedAt: null, payoutThresholdNotifiedAt: null },
    }),
  ]);

  await auditAdminAction(admin.userId, "affiliate.paid", affiliateId, {
    after: { amount: totalPaid, payoutRef, commissions: availableCommissions.length },
    ip: auditIp(req),
  });

  return NextResponse.json({ success: true, amount: totalPaid, commissions: availableCommissions.length });
});
