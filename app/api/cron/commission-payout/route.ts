import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendCommissionAvailableEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Daily cron — notifies affiliates when their commission hold period (30 days)
// has ended and payout is now available.
//
//   GET /api/cron/commission-payout
//   Authorization: Bearer <CRON_SECRET>
//
// Uses payoutEmailSent flag on Commission to prevent duplicate notifications.

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let notified = 0;
  let errors = 0;

  // Find commissions that are now available but haven't had email sent yet
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
    } catch (e) {
      logger.error("cron/commission-payout", `error for commission ${commission.id}`, e);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, notified, errors, at: now.toISOString() });
}
