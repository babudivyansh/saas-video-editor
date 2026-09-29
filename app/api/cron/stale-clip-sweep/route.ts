import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { runStaleClipSweep } from "@/lib/cron/stale-clip-sweep";
import { withCronTracking } from "@/lib/cron-tracking";

// Reconciles Auto Clips stranded at queued/rendering by a process crash
// mid-render (rerenderJob/renderJob already handle a caught exception
// themselves — see lib/cron/stale-clip-sweep.ts's doc comment).
//
//   GET /api/cron/stale-clip-sweep
//   Authorization: Bearer <CRON_SECRET>

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runStaleClipSweep();
  return NextResponse.json(result);
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("stale-clip-sweep", handleGET);
