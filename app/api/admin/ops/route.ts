import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { opsFlagsSchema } from "@/lib/admin/schemas";
import { renderQueueCounts } from "@/lib/admin/metrics";
import { getHeartbeats } from "@/lib/worker-heartbeat";
import { getFeatureFlags, getMaintenanceMode, setFeatureFlag, setMaintenanceMode } from "@/lib/flags";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// GET — one ops snapshot: queue counts + failed jobs, worker heartbeats,
// feature flags, maintenance mode, and largest tables (storage report).
export const GET = withAdmin(async () => {
  const [queueCounts, failedJobs, heartbeats, flags, maintenance, tableSizes] = await Promise.all([
    renderQueueCounts(),
    getFailedRenderJobs(),
    getHeartbeats(["editor-render", "social-refresh"]),
    getFeatureFlags(),
    getMaintenanceMode(),
    prisma.$queryRaw<Array<{ table: string; size: string; bytes: bigint }>>`
      SELECT relname AS "table",
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
             pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 12`.catch(() => []),
  ]);

  return NextResponse.json({
    queueCounts,
    failedJobs,
    heartbeats,
    flags,
    maintenance,
    tableSizes: tableSizes.map((t) => ({ table: t.table, size: t.size })),
  });
});

// PATCH — toggle a feature flag or maintenance mode (audited).
export const PATCH = withAdmin(async (req, { admin }) => {
  const { flag, maintenance } = await parseBody(req, opsFlagsSchema);

  if (flag) {
    const before = (await getFeatureFlags())[flag.name] ?? null;
    await setFeatureFlag(flag.name, flag.value);
    await auditAdminAction(admin.userId, "feature_flag.updated", flag.name, {
      before: { value: before },
      after: { value: flag.value },
      ip: auditIp(req),
    });
  }
  if (maintenance) {
    const before = await getMaintenanceMode();
    await setMaintenanceMode(maintenance);
    await auditAdminAction(admin.userId, maintenance.on ? "maintenance.enabled" : "maintenance.disabled", undefined, {
      before,
      after: maintenance,
      ip: auditIp(req),
    });
  }
  return NextResponse.json({
    flags: await getFeatureFlags(),
    maintenance: await getMaintenanceMode(),
  });
});

async function getFailedRenderJobs() {
  const { redis } = await import("@/lib/redis");
  if (!(await redis.ping())) return []; // Redis down: fail fast, no reconnect spam
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const queue = new Queue("editor-render", {
      connection: { url: env.REDIS_URL || "redis://127.0.0.1:6379", retryStrategy: () => null, maxRetriesPerRequest: 1 },
    });
    const failed = await queue.getFailed(0, 50);
    const jobs = failed.map((job) => ({
      id: job.id,
      projectId: (job.data as { projectId?: string })?.projectId,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
    await queue.close();
    return jobs;
  } catch (err) {
    logger.warn("admin-ops", "failed-jobs query unavailable", { reason: (err as Error).message });
    return [];
  }
}
