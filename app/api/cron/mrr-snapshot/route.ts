import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { captureMrrSnapshot } from "@/lib/admin/mrr-snapshot";
import { logger } from "@/lib/logger";
import { withCronTracking } from "@/lib/cron-tracking";

// Writes one MrrSnapshot row per UTC day. Same shared-secret guard as the
// other cron entrypoints:
//   15 3 * * *  curl -H "Authorization: Bearer $SOCIAL_REFRESH_SECRET" \
//                 https://app.example.com/api/cron/mrr-snapshot
//
// Run it soon after UTC midnight. The reading is "state as of now", so a run
// at 03:15 UTC records the day that just started — the exact minute matters
// far less than running every day without gaps, since a missed day is a hole
// in the series that can never be filled in afterwards.
async function handleGET(req: NextRequest) {
  const secret = env.SOCIAL_REFRESH_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await captureMrrSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (e) {
    logger.error("mrr-snapshot", "capture failed", e);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("mrr-snapshot", handleGET);
