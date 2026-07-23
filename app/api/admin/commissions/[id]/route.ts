import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { commissionActionSchema } from "@/lib/admin/schemas";
import { notifyAdminsIfPayoutEligible } from "@/lib/affiliate";
import { logger } from "@/lib/logger";

// POST /api/admin/commissions/[id]  body: { action: "release" | "reject", reason? }
//
// Financial state changes, so: one transaction, status-guarded transitions
// (release only from pending; reject only from pending/available — a repeat
// reject must NOT decrement the affiliate's totalEarned a second time), and
// an audit row for both outcomes.
export const POST = withAdmin<{ id: string }>(async (req, { admin, params }) => {
  const { id } = params;
  const { action, reason } = await parseBody(req, commissionActionSchema);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.commission.findUnique({ where: { id } });
    if (!existing) return { error: "Commission not found", status: 404 } as const;

    if (action === "release") {
      if (existing.status !== "pending") {
        return { error: `Cannot release a ${existing.status} commission`, status: 409 } as const;
      }
      const commission = await tx.commission.update({
        where: { id },
        data: { status: "available", availableAt: new Date() },
      });
      return { commission, before: existing } as const;
    }

    if (existing.status !== "pending" && existing.status !== "available") {
      return { error: `Cannot reject a ${existing.status} commission`, status: 409 } as const;
    }
    const commission = await tx.commission.update({ where: { id }, data: { status: "rejected" } });
    await tx.affiliate.update({
      where: { id: existing.affiliateId },
      data: { totalEarned: { decrement: existing.amount } },
    });
    return { commission, before: existing } as const;
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (action === "release") {
    // Bypassing the 30-day hold can push the affiliate's available balance
    // over the payout threshold — reject can't (it only removes balance).
    await notifyAdminsIfPayoutEligible(result.commission.affiliateId).catch((e) =>
      logger.error("admin/commissions", `admin notify failed for affiliate ${result.commission.affiliateId}`, e),
    );
  }

  await auditAdminAction(
    admin.userId,
    action === "release" ? "commission.released" : "commission.rejected",
    id,
    {
      before: { status: result.before.status, amount: result.before.amount, affiliateId: result.before.affiliateId },
      after: { status: result.commission.status },
      reason,
      ip: auditIp(req),
    },
  );

  return NextResponse.json({ commission: result.commission });
});
