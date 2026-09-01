import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { runEmptyDraftSweep } from "@/lib/cron/empty-draft-sweep";

// POST /api/admin/ops/run-empty-draft-sweep
// Clears empty draft projects the app created on users' behalf (see
// lib/cron/empty-draft-sweep). Unlike the sibling sweeps here this one has no
// scheduled counterpart — it deletes user-owned rows, so it is run manually.
//
// Defaults to a dry run: pass { "dryRun": false } to actually delete. Optional
// "userId" scopes it to one account, "minAgeDays" overrides the grace period.
export const POST = withAdmin(async (req, { admin }) => {
  let body: { dryRun?: boolean; userId?: string; minAgeDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    // No body — keep the safe defaults.
  }

  const result = await runEmptyDraftSweep({
    dryRun: body.dryRun !== false,
    userId: typeof body.userId === "string" ? body.userId : undefined,
    minAgeDays: typeof body.minAgeDays === "number" ? body.minAgeDays : undefined,
  });

  // A dry run changes nothing, but it still reads across every account, so it
  // is worth the same audit trail as the destructive pass.
  await auditAdminAction(admin.userId, "project.empty_draft_sweep_run", body.userId, {
    after: result,
    ip: auditIp(req),
  });

  return NextResponse.json(result);
});
