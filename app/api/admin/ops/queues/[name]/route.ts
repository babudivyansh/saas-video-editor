import { NextResponse } from "next/server";
import { withAdmin, parseBody, parseQuery } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { queueActionSchema, queueJobsQuerySchema } from "@/lib/admin/schemas";
import { rateLimit } from "@/lib/rate-limit";
import {
  DESTRUCTIVE_QUEUE_ACTIONS,
  QueueActionError,
  isKnownQueue,
  listJobs,
  queueDriver,
  runQueueAction,
} from "@/lib/admin/queues";

type Params = { name: string };

// GET /api/admin/ops/queues/[name]?state=failed — the jobs in one state.
export const GET = withAdmin<Params>(async (req, { params }) => {
  if (!isKnownQueue(params.name)) return NextResponse.json({ error: "Unknown queue" }, { status: 404 });
  const { state } = parseQuery(req, queueJobsQuerySchema);
  const jobs = await listJobs(params.name, state);
  return NextResponse.json({ name: params.name, driver: queueDriver(), state, jobs });
});

// POST /api/admin/ops/queues/[name] — retry / remove one job, or a bulk action
// (retry all failed, clean, pause/resume, drain). Destructive actions need the
// queue name typed as `confirmPhrase`. Every action is audited.
export const POST = withAdmin<Params>(async (req, { admin, params }) => {
  if (!isKnownQueue(params.name)) return NextResponse.json({ error: "Unknown queue" }, { status: 404 });
  const { action, jobId, confirmPhrase, reason } = await parseBody(req, queueActionSchema);

  if (DESTRUCTIVE_QUEUE_ACTIONS.includes(action) && confirmPhrase !== params.name) {
    return NextResponse.json({ error: `Type "${params.name}" to confirm` }, { status: 400 });
  }
  const { allowed } = await rateLimit(`admin-queue-action:${admin.userId}`, 60, 600);
  if (!allowed) return NextResponse.json({ error: "Too many queue actions — wait a few minutes" }, { status: 429 });

  try {
    const result = await runQueueAction(params.name, action, jobId);
    await auditAdminAction(admin.userId, `queue.${action}`, jobId ?? params.name, {
      after: { queue: params.name, driver: queueDriver(), ...result },
      reason,
      ip: auditIp(req),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof QueueActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
