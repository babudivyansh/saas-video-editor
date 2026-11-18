import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { cronSecretMatches } from "@/lib/cron-auth";
import { runStaleClipSweep } from "@/lib/cron/stale-clip-sweep";
import { reconcileOrphanedToolJobs } from "@/lib/reconcile-tool-jobs";
import { withCronTracking } from "@/lib/cron-tracking";
import { sweepAppTempFiles } from "@/lib/tmp-sweep";

// Reconciles Auto Clips stranded at queued/rendering by a process crash
// mid-render (rerenderJob/renderJob already handle a caught exception
// themselves — see lib/cron/stale-clip-sweep.ts's doc comment), and AI tool
// jobs a restart orphaned (lib/reconcile-tool-jobs.ts: failed and refunded).
// That reconcile also runs at boot, but a job started in the 15 minutes before
// a restart is too young for the boot pass and would otherwise wait for the
// next restart; running it here bounds the wait to this cron's cadence.
//
// The same crashes leave their downloads and renders in /tmp, which filled the
// Hostinger disk (24 GB); those are swept here too (lib/tmp-sweep.ts).
//
//   GET /api/cron/stale-clip-sweep
//   Authorization: Bearer <CRON_SECRET>

async function handleGET(req: NextRequest) {
  const secret = env.CRON_SECRET;
  if (!secret || !cronSecretMatches(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runStaleClipSweep();
  const toolJobsReconciled = await reconcileOrphanedToolJobs();
  const tmp = sweepAppTempFiles();
  return NextResponse.json({ ...result, toolJobsReconciled, tmpFilesRemoved: tmp.removed, tmpBytesFreed: tmp.freedBytes });
}

// Records when the run finished and whether it succeeded (lib/cron-tracking.ts).
export const GET = withCronTracking("stale-clip-sweep", handleGET);
