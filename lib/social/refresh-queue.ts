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

    new Worker("social-refresh", async () => { await refreshStaleAccounts(); }, { connection });

    const queue = new Queue("social-refresh", { connection });
    void queue.add(
      "tick",
      {},
      {
        repeat: { every: everyMin * 60_000 },
        jobId: "social-refresh-tick", // stable id => one repeatable schedule
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    logger.info("social-refresh", `BullMQ worker started (every ${everyMin}m)`);
  } catch (e) {
    logger.error("social-refresh", "BullMQ init failed", e);
    started = false;
  }
}
