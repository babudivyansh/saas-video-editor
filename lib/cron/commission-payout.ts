// Shared by the scheduled cron route (app/api/cron/commission-payout) and the
// admin-triggered manual sweep (app/api/admin/commissions/run-payout-sweep) —
// one implementation so the two never drift apart.

import { prisma } from "@/lib/prisma";
import { sendCommissionAvailableEmail } from "@/lib/email";
import { notifyAdminsIfPayoutEligible } from "@/lib/affiliate";
import { logger } from "@/lib/logger";

export interface CommissionPayoutSweepResult {
  ok: true;
  notified: number;
  errors: number;
  at: string;
}

/**
 * Notifies affiliates when their commission hold period (30 days) has ended
 * and flips the commission to "available" for payout. The availableAt: { lte:
 * now } filter sweeps everything overdue, not just "due today" — so this
 * self-heals any backlog in one pass regardless of how long it's been since
 * the last run. Uses payoutEmailSent to prevent duplicate notifications.
 */
export async function runCommissionPayoutSweep(): Promise<CommissionPayoutSweepResult> {
  const now = new Date();
  let notified = 0;
  let errors = 0;

  const available = await prisma.commission.findMany({
    where: {
      availableAt: { lte: now },
      status: "pending",
      payoutEmailSent: false,
    },
    include: {
      affiliate: {
        include: { user: { select: { email: true, firstName: true, name: true } } },
      },
    },
  });

  for (const commission of available) {
    try {
      const { user } = commission.affiliate;
      await sendCommissionAvailableEmail(
        user.email,
        user.firstName ?? user.name ?? "",
        commission.amount,
      );
      await prisma.commission.update({
        where: { id: commission.id },
        data: { status: "available", payoutEmailSent: true },
      });
      notified++;
      // Best-effort admin alert — must never turn a successful commission
      // flip into a sweep-reported error.
      await notifyAdminsIfPayoutEligible(commission.affiliateId).catch((e) =>
        logger.error("cron/commission-payout", `admin notify failed for affiliate ${commission.affiliateId}`, e),
      );
    } catch (e) {
      logger.error("cron/commission-payout", `error for commission ${commission.id}`, e);
      errors++;
    }
  }

  return { ok: true, notified, errors, at: now.toISOString() };
}
