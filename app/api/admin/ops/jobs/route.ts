import { NextResponse } from "next/server";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { opsJobActionSchema } from "@/lib/admin/schemas";
import { env } from "@/lib/env";

// POST /api/admin/ops/jobs  body: { jobId, action: retry|remove, queueName? }
// Operates on the given queue's dead-letter set — defaults to editor-render
// for backward compatibility with any caller that predates queueName.
export const POST = withAdmin(async (req, { admin }) => {
  const { jobId, action, queueName = "editor-render" } = await parseBody(req, opsJobActionSchema);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Queue } = require("bullmq") as typeof import("bullmq");
  const queue = new Queue(queueName, {
    connection: { url: env.REDIS_URL || "redis://127.0.0.1:6379", retryStrategy: () => null, maxRetriesPerRequest: 1 },
  });
  try {
    const job = await queue.getJob(jobId);
    if (!job) return NextResponse.json({ error: "Job not found (it may have been cleaned up)" }, { status: 404 });

    if (action === "retry") await job.retry();
    else await job.remove();

    await auditAdminAction(admin.userId, `render_job.${action}`, jobId, {
      after: { queueName, projectId: (job.data as { projectId?: string })?.projectId, failedReason: job.failedReason },
      ip: auditIp(req),
    });
    return NextResponse.json({ success: true });
  } finally {
    await queue.close();
  }
});
