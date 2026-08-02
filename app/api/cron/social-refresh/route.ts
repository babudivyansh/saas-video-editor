import { NextRequest, NextResponse } from "next/server";
import { refreshStaleAccounts, pruneTimeSeries, sendWeeklyDigests } from "@/lib/social/service";
import { refreshStaleCompetitors } from "@/lib/social/competitors";
import { refreshClipPublishMetrics } from "@/lib/autoclip-publish";
import { recalibrateViralityWeights } from "@/lib/virality-calibration";
import { env } from "@/lib/env";

// Scheduled entrypoint for an external scheduler (cron-job.org, Vercel Cron,
// GitHub Actions, etc.). Protected by a shared secret in the Authorization
// header (`Bearer <SOCIAL_REFRESH_SECRET>`) or `?secret=`.
//
// Jobs (select with ?job=):
//   refresh              (default) — re-sync stale accounts + clip-publish metrics
//   retention                      — collapse >90d snapshots to daily granularity
//   digest                         — weekly per-user social summary email
//   recalibrate-virality           — recompute AutoClip virality-score weights from
//                                    real ClipPublish engagement (no-op unless the
//                                    "autoclip_calibration_enabled" Config flag is on
//                                    and there's enough labeled data — see
//                                    lib/virality-calibration.ts)
//
// Example crontab:
//   0 */6 * * *  curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh
//   0 4 * * 0    curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh?job=retention
//   0 5 * * 1    curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                  https://app.example.com/api/cron/social-refresh?job=recalibrate-virality
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
    const pruned = await pruneTimeSeries();
    // `deleted` is retained for any existing monitoring that reads it.
    return NextResponse.json({ ok: true, job, deleted: pruned.snapshots, pruned });
  }
  if (job === "digest") {
    const { sent } = await sendWeeklyDigests();
    return NextResponse.json({ ok: true, job, sent });
  }
  if (job === "recalibrate-virality") {
    const result = await recalibrateViralityWeights();
    return NextResponse.json({ ok: true, job, ...result });
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
