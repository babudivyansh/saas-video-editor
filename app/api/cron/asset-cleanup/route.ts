import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { KNOWN_CRON_JOBS } from "@/lib/cron-tracking";
import { withCronTracking } from "@/lib/cron-tracking";
import { purgeExpiredArchives, sweepOrphanedUploads } from "@/lib/asset-cleanup";

// Scheduled entrypoint for an external scheduler (cron-job.org, Vercel Cron,
// GitHub Actions, etc.) — same shared-secret pattern as
// app/api/cron/social-refresh. Closes the audit finding that no job existed
// to reconcile orphaned S3 objects or hard-delete archived assets.
//
// Jobs (select with ?job=), implemented in lib/asset-cleanup.ts (shared with
// the admin Content & Storage page):
//   orphans    (default) — deletes S3 objects whose PendingUpload row never
//                           got cleared (the DB insert after upload failed)
//   retention            — permanently deletes assets archived >30 days ago
//
// Example crontab:
//   */15 * * * *  curl -H "Authorization: Bearer $ASSET_CLEANUP_SECRET" \
//                   https://app.example.com/api/cron/asset-cleanup
//   0 5 * * *     curl -H "Authorization: Bearer $ASSET_CLEANUP_SECRET" \
//                   https://app.example.com/api/cron/asset-cleanup?job=retention

async function handleGET(req: NextRequest) {
  const secret = env.ASSET_CLEANUP_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Recorded per job, after validation — a route-level heartbeat would let the
  // 15-minute `orphans` job vouch for `retention`. See KNOWN_CRON_JOBS.
  const job = req.nextUrl.searchParams.get("job") ?? "orphans";
  if (!(KNOWN_CRON_JOBS["asset-cleanup"] as readonly string[]).includes(job)) {
    return NextResponse.json({ error: `unknown job "${job}"` }, { status: 400 });
  }

  const { deleted, failed } = job === "retention" ? await purgeExpiredArchives() : await sweepOrphanedUploads();
  return NextResponse.json({ ok: true, job, deleted, failed });
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("asset-cleanup", handleGET);
