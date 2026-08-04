import { NextRequest, NextResponse } from "next/server";
import { refreshStaleAccounts, pruneTimeSeries, sendWeeklyDigests } from "@/lib/social/service";
import { refreshStaleCompetitors } from "@/lib/social/competitors";
import { evaluateGoals, recomputeScores, runScheduledReports, syncDailyMetrics } from "@/lib/social/jobs";
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
//   daily-metrics                  — fill gaps in the per-day series (refresh keeps the
//                                    CURRENT numbers current; this keeps the HISTORY complete)
//   scores                         — recompute persisted viral/ai post scores + account health
//   reports                        — queue runs for scheduled report configs that are due
//   goals                          — flip reached goals to hit and lapsed ones to missed
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
//   30 2 * * *   …?job=daily-metrics   (late enough that provider restatement has settled)
//   0 3 * * *    …?job=scores          (cohorts shift nightly)
//   15 3 * * *   …?job=goals           (immediately after scores, so both agree)
//   0 6 * * *    …?job=reports         (due configs; due-ness is elapsed time, not a calendar match)
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
  if (job === "daily-metrics") {
    const result = await syncDailyMetrics();
    return NextResponse.json({ ok: true, job, ...result });
  }
  if (job === "scores") {
    const result = await recomputeScores();
    return NextResponse.json({ ok: true, job, ...result });
  }
  if (job === "reports") {
    const result = await runScheduledReports();
    return NextResponse.json({ ok: true, job, ...result });
  }
  if (job === "goals") {
    const result = await evaluateGoals();
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
