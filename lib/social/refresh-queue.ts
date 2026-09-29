import { refreshStaleAccounts } from "./service";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

// Optional self-contained scheduler for always-on servers. OFF by default;
// enable with SOCIAL_REFRESH_DRIVER=bullmq (BullMQ + Redis are already deps).
// On serverless/preview, prefer the /api/cron/social-refresh endpoint driven by
// an external scheduler instead.
let started = false;

export function startSocialRefreshWorker(): void {
  if (started || env.SOCIAL_REFRESH_DRIVER !== "bullmq") return;
  started = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue, Worker } = require("bullmq") as typeof import("bullmq");
    const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379" };
    const everyMin = parseInt(env.SOCIAL_REFRESH_INTERVAL_MIN || "360", 10);

    // BullMQ re-emits ioredis connection errors on these instances, and an
    // 'error' event with no listener crashes the process (render-queue.ts had
    // the same fix). Log only; there's nothing else to do.
    const worker = new Worker("social-refresh", async () => { await refreshStaleAccounts(); }, { connection });
    worker.on("error", (e) => logger.error("social-refresh", "worker error", e));

    const queue = new Queue("social-refresh", { connection });
    queue.on("error", (e) => logger.error("social-refresh", "queue error", e));
    queue.add(
      "tick",
      {},
      {
        repeat: { every: everyMin * 60_000 },
        jobId: "social-refresh-tick", // stable id => one repeatable schedule
        removeOnComplete: true,
        removeOnFail: true,
      },
    ).catch((e) => {
      // Unhandled, this rejection terminated the process on a Redis outage.
      logger.error("social-refresh", "could not schedule the repeatable tick", e);
    });
    logger.info("social-refresh", `BullMQ worker started (every ${everyMin}m)`);
    void import("@/lib/worker-heartbeat").then(({ startHeartbeat }) => startHeartbeat("social-refresh"));
  } catch (e) {
    logger.error("social-refresh", "BullMQ init failed", e);
    started = false;
  }
}
