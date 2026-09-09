import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runSubmagicSweep } from "@/lib/cron/submagic-sweep";

// Reconciles premium caption renders (lib/caption-render-job.ts) — see
// lib/cron/submagic-sweep.ts's doc comment for why this is the primary
// completion path rather than a safety net, and why a job in an unknown
// provider state is resolved here before anything is allowed to spend again.
//
//   GET /api/cron/submagic-sweep
//   Authorization: Bearer <CRON_SECRET>
// Recommended cadence: every 2 minutes (see SETUP.md), matching dub-sweep.
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  const authz = req.headers.get("authorization");
  if (!secret || authz !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void import("@/lib/cron-tracking").then((m) => m.recordCronRun("submagic-sweep")).catch(() => {});

  const result = await runSubmagicSweep();
  return NextResponse.json(result);
}
