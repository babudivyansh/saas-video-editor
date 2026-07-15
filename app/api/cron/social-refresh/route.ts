import { NextRequest, NextResponse } from "next/server";
import { refreshStaleAccounts, pruneOldSnapshots, sendWeeklyDigests } from "@/lib/social/service";
import { refreshStaleCompetitors } from "@/lib/social/competitors";
import { refreshClipPublishMetrics } from "@/lib/autoclip-publish";
import { env } from "@/lib/env";

// Scheduled entrypoint for an external scheduler (cron-job.org, Vercel Cron,
// GitHub Actions, etc.). Protected by a shared secret in the Authorization
// header (`Bearer <SOCIAL_REFRESH_SECRET>`) or `?secret=`.
//
// Jobs (select with ?job=):
//   refresh   (default) — re-sync stale accounts + clip-publish metrics
//   retention           — collapse >90d snapshots to daily granularity
//   digest              — weekly per-user social summary email
//
// Example crontab:
//   0 */6 * * *  curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh
//   0 4 * * 0    curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh?job=retention
export async function GET(req: NextRequest) {
  const secret = env.SOCIAL_REFRESH_SECRET;
  const provided =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    req.nextUrl.searchParams.get("secret") ||
    "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = req.nextUrl.searchParams.get("job") ?? "refresh";
  if (job === "retention") {
    const { deleted } = await pruneOldSnapshots();
    return NextResponse.json({ ok: true, job, deleted });
  }
  if (job === "digest") {
    const { sent } = await sendWeeklyDigests();
    return NextResponse.json({ ok: true, job, sent });
  }
  if (job !== "refresh") {
    return NextResponse.json({ error: `unknown job "${job}"` }, { status: 400 });
  }
  const result = await refreshStaleAccounts();
  const clipPublishResult = await refreshClipPublishMetrics().catch(() => ({ updated: 0 }));
  const competitorResult = await refreshStaleCompetitors().catch(() => ({ refreshed: 0 }));
  return NextResponse.json({
    ok: true, job, ...result,
    clipPublishMetricsUpdated: clipPublishResult.updated,
    competitorsRefreshed: competitorResult.refreshed,
  });
}
