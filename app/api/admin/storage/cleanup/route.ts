import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { storageCleanupSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { purgeExpiredArchives, sweepOrphanedUploads } from "@/lib/asset-cleanup";

// POST /api/admin/storage/cleanup  { job: orphans|retention, dryRun, confirmPhrase?, reason? }
// The same sweeps the asset-cleanup cron runs (lib/asset-cleanup.ts), on
// demand. dryRun returns what would go without touching anything; a real run
// needs the job name typed and a reason. Both are audited.
export const POST = withAdmin(async (req, { admin }) => {
  const { job, dryRun, confirmPhrase, reason } = await parseBody(req, storageCleanupSchema);
  if (!dryRun && (confirmPhrase !== job || !reason)) {
    return NextResponse.json({ error: `Type "${job}" and give a reason to run this for real` }, { status: 400 });
  }
  const { allowed } = await rateLimit(`admin-storage-cleanup:${admin.userId}`, 20, 900);
  if (!allowed) return NextResponse.json({ error: "Too many runs — wait a few minutes" }, { status: 429 });

  const result = job === "retention" ? await purgeExpiredArchives({ dryRun }) : await sweepOrphanedUploads({ dryRun });
  await auditAdminAction(admin.userId, `storage.${job}_${dryRun ? "previewed" : "run"}`, undefined, {
    after: { matched: result.matched, deleted: result.deleted, failed: result.failed, bytes: result.bytes },
    reason,
    ip: auditIp(req),
  });
  return NextResponse.json({ ok: true, job, ...result });
});
