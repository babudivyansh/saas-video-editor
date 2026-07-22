import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { runStaleClipSweep } from "@/lib/cron/stale-clip-sweep";

// POST /api/admin/ops/run-stale-clip-sweep
// On-demand version of the scheduled cron (app/api/cron/stale-clip-sweep) —
// lets an admin unstick a stranded clip immediately rather than waiting on
// the next scheduled run.
export const POST = withAdmin(async (req, { admin }) => {
  const result = await runStaleClipSweep();
  await auditAdminAction(admin.userId, "clip.stale_sweep_run", undefined, {
    after: result,
    ip: auditIp(req),
  });
  return NextResponse.json(result);
});
