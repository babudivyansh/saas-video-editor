import { NextRequest, NextResponse } from "next/server";
import { publishDueClips } from "@/lib/clip-scheduler";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Scheduled entrypoint for publishing clips whose scheduledFor time has
// arrived. Same shape and secret convention as the other app/api/cron/*
// routes: an external scheduler hits it, protected by a shared secret in the
// Authorization header or ?secret=.
//
// ClipPublish.scheduledFor was written by the publish route from the day it
// was added but never read by anything, so a scheduled post sat pending
// forever. This is what makes it fire.
//
// Run it often — a schedule is only as precise as its polling interval:
//   */10 * * * *  curl -H "Authorization: Bearer $CRON_SECRET" \
//                   https://app.example.com/api/cron/clip-publish
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    const query = new URL(req.url).searchParams.get("secret");
    const provided = header?.startsWith("Bearer ") ? header.slice(7) : query;
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await publishDueClips();
    logger.info("clip-scheduler", `published ${result.published}, reminded ${result.reminded}, failed ${result.failed}, skipped ${result.skipped}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("clip-scheduler", "scheduled publish run failed", err);
    return NextResponse.json({ error: "Scheduled publish run failed" }, { status: 500 });
  }
}
