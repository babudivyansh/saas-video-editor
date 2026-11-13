import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { rescanSkippedUploads } from "@/lib/moderation-rescan";

// POST /api/admin/ops/rescan-moderation
// Sends user uploads whose content scan was skipped back through moderation
// (see lib/moderation-rescan). Manual only. Defaults to a dry run: pass
// { "dryRun": false } to queue the scans. Optional "limit" (1-500, default
// 100) per kind of row.
export const POST = withAdmin(async (req, { admin }) => {
  let body: { dryRun?: boolean; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // No body — keep the safe defaults.
  }

  const result = await rescanSkippedUploads({
    dryRun: body.dryRun !== false,
    limit: typeof body.limit === "number" ? body.limit : undefined,
  });

  await auditAdminAction(admin.userId, "moderation.rescan_run", undefined, {
    after: result,
    ip: auditIp(req),
  });

  return NextResponse.json(result);
});
