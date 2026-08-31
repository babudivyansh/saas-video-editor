import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { runDubSweep } from "@/lib/cron/dub-sweep";

// POST /api/admin/ops/run-dub-sweep
// On-demand version of the scheduled cron (app/api/cron/dub-sweep) — lets an
// admin unstick a stranded dub immediately rather than waiting on the next
// scheduled run.
export const POST = withAdmin(async (req, { admin }) => {
  const result = await runDubSweep();
  await auditAdminAction(admin.userId, "clip.dub_sweep_run", undefined, {
    after: result,
    ip: auditIp(req),
  });
  return NextResponse.json(result);
});
