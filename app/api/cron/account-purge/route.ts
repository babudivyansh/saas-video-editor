import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hardDeleteUserAccount } from "@/lib/account-deletion";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Daily cron — hard-deletes accounts whose 30-day deactivation recovery
// window (app/api/account/deactivate) has passed. Uses the same
// hardDeleteUserAccount core the user-initiated DELETE /api/auth/profile
// route calls — including its billing-history safeguard, which here just
// means "leave it deactivated and let support follow up" instead of a 409
// nobody's around to see.
//
//   GET /api/cron/account-purge
//   Authorization: Bearer <CRON_SECRET>

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await prisma.user.findMany({
    where: { deactivatedAt: { not: null }, deactivationScheduledPurgeAt: { lte: new Date() } },
    select: { id: true },
  });

  let purged = 0;
  let blocked = 0;
  for (const u of due) {
    try {
      const result = await hardDeleteUserAccount(u.id);
      if (result.ok) purged++;
      else {
        blocked++;
        logger.warn("cron/account-purge", `purge blocked for ${u.id}`, { reason: result.reason });
      }
    } catch (e) {
      logger.error("cron/account-purge", `purge failed for ${u.id}`, e);
    }
  }

  return NextResponse.json({ ok: true, purged, blocked, checked: due.length, at: new Date().toISOString() });
}
