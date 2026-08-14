import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { kpisSection } from "@/lib/admin/metrics";
import { getSyncStats } from "@/lib/social/service";
import { sendAdminDigestEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

// Weekly ops digest for every ADMIN user. External scheduler entrypoint,
// same shared-secret guard as /api/cron/social-refresh:
//   0 8 * * 1  curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                https://app.example.com/api/cron/admin-digest
export async function GET(req: NextRequest) {
  const secret = env.SOCIAL_REFRESH_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("admin-digest")).catch(() => {});

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [kpis, gen7d, genFailed7d, syncStats, admins, newReviews7d, pendingReviews, reportedReviews] = await Promise.all([
    kpisSection(7),
    prisma.generation.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.generation.count({ where: { createdAt: { gte: weekAgo }, status: "failed" } }),
    getSyncStats().catch(() => ({ ok: 0, fail: 0 })),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true } }),
    prisma.review.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.review.count({ where: { status: "pending" } }),
    prisma.review.count({ where: { reportCount: { gt: 0 } } }),
  ]);

  let sent = 0;
  for (const a of admins) {
    try {
      await sendAdminDigestEmail(a.email, {
        mrrInPaise: kpis.mrrInPaise,
        revenueMtdInPaise: kpis.revenueMtdInPaise,
        newUsers7d: kpis.newUsers,
        activeSubscribers: kpis.activeSubscribers,
        generations7d: gen7d,
        failedGenerations7d: genFailed7d,
        syncFailuresToday: syncStats.fail,
        newReviews7d,
        pendingReviews,
        reportedReviews,
      });
      sent++;
    } catch (e) {
      logger.error("admin-digest", `send failed for ${a.email}`, e);
    }
  }
  return NextResponse.json({ ok: true, sent });
}
