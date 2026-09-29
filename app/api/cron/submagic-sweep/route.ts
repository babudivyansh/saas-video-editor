import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { runSubmagicSweep } from "@/lib/cron/submagic-sweep";
import { withCronTracking } from "@/lib/cron-tracking";

// Reconciles premium caption renders (lib/caption-render-job.ts) — see
// lib/cron/submagic-sweep.ts's doc comment for why this is the primary
// completion path rather than a safety net, and why a job in an unknown
// provider state is resolved here before anything is allowed to spend again.
//
//   GET /api/cron/submagic-sweep
//   Authorization: Bearer <CRON_SECRET>
// Recommended cadence: every 2 minutes (see SETUP.md), matching dub-sweep.
async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSubmagicSweep();
  return NextResponse.json(result);
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("submagic-sweep", handleGET);
