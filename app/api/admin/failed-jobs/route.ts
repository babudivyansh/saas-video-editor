import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { KNOWN_RENDER_QUEUE_NAMES } from "@/lib/render-queue";

// Surfaces BullMQ's dead-letter set across all known queues so stuck/failed
// renders aren't silently invisible once BullMQ is the default driver (see
// lib/render-queue.ts). Harmless (returns an empty list per queue) when a
// queue hasn't been created yet, or when running with RENDER_QUEUE_DRIVER=in-process.
export const GET = withAdmin(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379" };

    const jobsByQueue = await Promise.all(
      KNOWN_RENDER_QUEUE_NAMES.map(async (queueName) => {
        const queue = new Queue(queueName, { connection });
        try {
          const failed = await queue.getFailed(0, 50);
          return failed.map((job) => ({
            queueName,
            id: job.id,
            projectId: job.data?.projectId,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
            finishedOn: job.finishedOn,
          }));
        } finally {
          await queue.close();
        }
      })
    );

    const jobs = jobsByQueue.flat().sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));
    return NextResponse.json({ jobs });
  } catch (err) {
    logger.error("admin/failed-jobs", "request failed", err);
    return NextResponse.json({ error: "Failed to query render queues" }, { status: 500 });
  }
});
