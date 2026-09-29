import { NextResponse, after } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { cronRunSchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";
import { confirmPhraseFor, runIdForPath } from "@/lib/cron-catalog";
import { dispatchCronJob, findScheduleEntry, recordManualRun, secretFor } from "@/lib/cron-dispatch";

// POST /api/admin/ops/cron/run — run one scheduled job now.
//
// The job runs through its own /api/cron/* route with its own secret (exactly
// like a scheduled run), so its outcome lands in the same tracking the Ops
// page reads. It is dispatched after the response: some jobs take minutes,
// and the page polls for the new result instead of holding a request open.
//
// Only exact CRON_SCHEDULE paths are accepted — this can't be pointed at an
// arbitrary URL. Danger-tier jobs (money, deletion, user email) also need the
// typed confirmation phrase, checked here and not only in the UI.
export const POST = withAdmin(async (req, { admin }) => {
  const { path, confirmPhrase, reason } = await parseBody(req, cronRunSchema);

  const entry = findScheduleEntry(path);
  if (!entry) return NextResponse.json({ error: "Unknown scheduled job" }, { status: 400 });

  const expected = confirmPhraseFor(path);
  if (expected && confirmPhrase !== expected) {
    return NextResponse.json({ error: `Type "${expected}" to confirm this job` }, { status: 400 });
  }

  const secret = secretFor(entry);
  if (!secret) {
    return NextResponse.json({ error: `${entry.secret} is not set on the server, so this job can't run` }, { status: 409 });
  }

  const { allowed } = await rateLimit(`admin-cron-run:${admin.userId}`, 20, 600);
  if (!allowed) return NextResponse.json({ error: "Too many manual runs — wait a few minutes" }, { status: 429 });

  const at = new Date().toISOString();
  await recordManualRun(path, { by: admin.email, at });
  await auditAdminAction(admin.userId, "cron.run_manual", runIdForPath(path), {
    after: { path },
    reason,
    ip: auditIp(req),
  });

  const origin = req.nextUrl.origin;
  after(() => dispatchCronJob(origin, entry, secret));

  return NextResponse.json({ ok: true, started: path, at }, { status: 202 });
});
