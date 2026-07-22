import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { runCommissionPayoutSweep } from "@/lib/cron/commission-payout";

// POST /api/admin/commissions/run-payout-sweep
// On-demand version of the scheduled cron (app/api/cron/commission-payout) —
// lets an admin close the "did the cron ever actually run" gap immediately
// rather than waiting on a cPanel crontab change to take effect.
export const POST = withAdmin(async (req, { admin }) => {
  const result = await runCommissionPayoutSweep();
  await auditAdminAction(admin.userId, "commission.payout_sweep_run", undefined, {
    after: result,
    ip: auditIp(req),
  });
  return NextResponse.json(result);
});
