import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdmin, parseBody } from "@/lib/admin/api";
import { auditAdminAction, auditIp } from "@/lib/admin/audit";
import { opsFlagsSchema } from "@/lib/admin/schemas";
import { renderQueueCounts } from "@/lib/admin/metrics";
import { getHeartbeats } from "@/lib/worker-heartbeat";
import { getCronRunStatuses } from "@/lib/cron-tracking";
import { getCronJobRows } from "@/lib/admin/cron-jobs";
import { redis } from "@/lib/redis";
import { getFeatureFlags, getMaintenanceMode, setFeatureFlag, setMaintenanceMode } from "@/lib/flags";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { KNOWN_RENDER_QUEUE_NAMES } from "@/lib/render-queue";
import { captionProviderHealth } from "@/lib/captions/CaptionRendererFactory";
import { captionRenderOpsSnapshot } from "@/lib/captions/ops";

// GET — one ops snapshot: queue counts + failed jobs, worker heartbeats,
// feature flags, maintenance mode, and largest tables (storage report).
export const GET = withAdmin(async () => {
  const [
    queueCounts, failedJobs, heartbeats, flags, maintenance, cronRuns, tableSizes,
    captionProvider, captionRenders, cronTickLastAt, cronJobs, dbOk, redisOk,
  ] = await Promise.all([
    renderQueueCounts(),
    getFailedRenderJobs(),
    getHeartbeats([...KNOWN_RENDER_QUEUE_NAMES, "social-refresh"]),
    getFeatureFlags(),
    getMaintenanceMode(),
    getCronRunStatuses(),
    prisma.$queryRaw<Array<{ table: string; size: string; bytes: bigint }>>`
      SELECT relname AS "table",
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
             pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 12`.catch(() => []),
    // Premium caption rendering. Both of these are null-safe: the Ops page has
    // to render even when the provider is unreachable, which is precisely when
    // an operator most needs to look at it.
    captionProviderHealth(),
    captionRenderOpsSnapshot(),
    // Last minute /api/cron-tick was called by the external scheduler.
    redis.get("cron:tick:last").catch(() => null),
    getCronJobRows(),
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping(),
  ]);

  return NextResponse.json({
    queueCounts,
    failedJobs,
    heartbeats,
    flags,
    maintenance,
    cronRuns,
    cronJobs,
    health: { db: dbOk, redis: redisOk },
    queueDriver: env.RENDER_QUEUE_DRIVER ?? "bullmq",
    tableSizes: tableSizes.map((t) => ({ table: t.table, size: t.size })),
    captionProvider,
    captionRenders,
    cronTickLastAt,
    // Age computed here, not in the page: a render must be pure (no Date.now()).
    cronTickAgeSeconds: cronTickLastAt ? Math.round((Date.now() - new Date(cronTickLastAt).getTime()) / 1000) : null,
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
    // Strip `confirm` — it exists only to force the caller through the
    // confirm-gate in opsFlagsSchema, not to be persisted or audited.
    const { on, message } = maintenance;
    const before = await getMaintenanceMode();
    await setMaintenanceMode({ on, message });
    await auditAdminAction(admin.userId, on ? "maintenance.enabled" : "maintenance.disabled", undefined, {
      before,
      after: { on, message },
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
    const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379", retryStrategy: () => null, maxRetriesPerRequest: 1 };

    const jobsByQueue = await Promise.all(
      KNOWN_RENDER_QUEUE_NAMES.map(async (queueName) => {
        const queue = new Queue(queueName, { connection });
        try {
          const failed = await queue.getFailed(0, 50);
          return failed.map((job) => ({
            queueName,
            id: job.id,
            projectId: (job.data as { projectId?: string })?.projectId,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
          }));
        } finally {
          await queue.close();
        }
      })
    );

    return jobsByQueue.flat().sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    logger.warn("admin-ops", "failed-jobs query unavailable", { reason: (err as Error).message });
    return [];
  }
}
