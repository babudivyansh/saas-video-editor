import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { cronPauseSchema } from "@/lib/admin/schemas";
import { runIdForPath } from "@/lib/cron-catalog";
import { findScheduleEntry, setCronPaused } from "@/lib/cron-dispatch";

// POST /api/admin/ops/cron/pause — pause or resume one scheduled job.
// /api/cron-tick skips a paused job until it is resumed. "Run now" still works
// on a paused job: pausing stops the schedule, not the operator.
export const POST = withAdmin(async (req, { admin }) => {
  const { path, paused, reason } = await parseBody(req, cronPauseSchema);
  if (!findScheduleEntry(path)) return NextResponse.json({ error: "Unknown scheduled job" }, { status: 400 });

  await setCronPaused(path, paused ? { by: admin.email, at: new Date().toISOString(), reason } : null);
  await auditAdminAction(admin.userId, paused ? "cron.paused" : "cron.resumed", runIdForPath(path), {
    after: { path, paused },
    reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, path, paused });
});
