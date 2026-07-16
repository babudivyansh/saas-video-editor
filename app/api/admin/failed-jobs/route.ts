import { NextResponse } from "next/server";
import { withAdmin } from "@/lib/admin/api";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Surfaces BullMQ's dead-letter set for the editor-render queue so stuck/
// failed renders aren't silently invisible once BullMQ is the default driver
// (see lib/render-queue.ts). Harmless (returns an empty list) when the queue
// hasn't been created yet, or when running with RENDER_QUEUE_DRIVER=in-process.
export const GET = withAdmin(async () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue } = require("bullmq") as typeof import("bullmq");
    const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379" };
    const queue = new Queue("editor-render", { connection });

    const failed = await queue.getFailed(0, 50);
    const jobs = failed.map((job) => ({
      id: job.id,
      projectId: job.data?.projectId,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    }));

    await queue.close();
    return NextResponse.json({ jobs });
  } catch (err) {
    logger.error("admin/failed-jobs", "request failed", err);
    return NextResponse.json({ error: "Failed to query render queue" }, { status: 500 });
  }
});
