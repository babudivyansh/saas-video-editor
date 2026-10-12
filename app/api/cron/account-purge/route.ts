import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hardDeleteUserAccount } from "@/lib/account-deletion";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";
import { withCronTracking } from "@/lib/cron-tracking";

// Daily cron — deletes accounts whose 30-day deactivation recovery window
// (app/api/account/deactivate) has passed. Uses the same
// hardDeleteUserAccount core the user-initiated DELETE /api/auth/profile
// route calls. An account with billing history is purged too: its invoices
// and payment records stay, everything else is deleted and the User row is
// anonymised (mode "anonymised"), which also takes it out of this query.
//
//   GET /api/cron/account-purge
//   Authorization: Bearer <CRON_SECRET>

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const due = await prisma.user.findMany({
    where: { deactivatedAt: { not: null }, deactivationScheduledPurgeAt: { lte: new Date() }, purgedAt: null },
    select: { id: true },
  });

  let purged = 0;
  let anonymised = 0;
  const failedIds: string[] = [];
  for (const u of due) {
    try {
      const result = await hardDeleteUserAccount(u.id);
      if (result.ok) {
        purged++;
        if (result.mode === "anonymised") anonymised++;
      } else {
        failedIds.push(u.id);
        logger.error("cron/account-purge", `purge refused for ${u.id}`, { reason: result.reason });
      }
    } catch (e) {
      failedIds.push(u.id);
      logger.error("cron/account-purge", `purge failed for ${u.id}`, e);
    }
  }

  // One summary line on top of the per-account entries, so a bad run is a
  // single easy-to-triage alert. A failed account stays due and is retried
  // on the next run.
  if (failedIds.length > 0) {
    logger.error("cron/account-purge", `${failedIds.length} account(s) past their purge date could not be purged`, { userIds: failedIds });
  }

  return NextResponse.json({ ok: true, purged, anonymised, failed: failedIds.length, checked: due.length, at: new Date().toISOString() });
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("account-purge", handleGET);
