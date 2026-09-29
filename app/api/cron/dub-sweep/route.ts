import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { runDubSweep } from "@/lib/cron/dub-sweep";
import { withCronTracking } from "@/lib/cron-tracking";

// Reconciles AutoClip dub jobs (lib/autoclip-dub.ts) whose ElevenLabs
// completion the app hasn't noticed yet — see lib/cron/dub-sweep.ts's own
// doc comment for why this is the primary completion path, not a safety net.
//
//   GET /api/cron/dub-sweep
//   Authorization: Bearer <CRON_SECRET>
// Recommended cadence: every 2 minutes (see SETUP.md).

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runDubSweep();
  return NextResponse.json(result);
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("dub-sweep", handleGET);
