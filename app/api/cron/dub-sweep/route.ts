import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runDubSweep } from "@/lib/cron/dub-sweep";

// Reconciles AutoClip dub jobs (lib/autoclip-dub.ts) whose ElevenLabs
// completion the app hasn't noticed yet — see lib/cron/dub-sweep.ts's own
// doc comment for why this is the primary completion path, not a safety net.
//
//   GET /api/cron/dub-sweep
//   Authorization: Bearer <CRON_SECRET>
// Recommended cadence: every 2 minutes (see SETUP.md).

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("dub-sweep")).catch(() => {});

  const result = await runDubSweep();
  return NextResponse.json(result);
}
