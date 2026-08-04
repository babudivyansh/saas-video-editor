// Report job dispatch.
//
// Mirrors lib/social/refresh-queue.ts exactly: BullMQ when it is configured,
// an in-process fallback when it is not. The fallback is not a toy — most
// single-server deploys of this app will never set REDIS_URL, and "reports
// only work if you run a worker" is a feature that does not exist for them.
//
// Either way the request returns 202 immediately. An annual multi-account PDF
// with a rasterized chart per account is a 5–20 second job, and doing that
// inside a request handler blocks the event loop for every other request on the
// instance.

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { buildReport } from "./index";

const QUEUE_NAME = "social-reports";

let worker: unknown = null;
let queue: { add: (name: string, data: { runId: string }) => Promise<unknown> } | null = null;

function bullmqEnabled(): boolean {
  return env.SOCIAL_REFRESH_DRIVER === "bullmq" && Boolean(env.REDIS_URL);
}

function ensureQueue(): typeof queue {
  if (queue || !bullmqEnabled()) return queue;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Queue, Worker } = require("bullmq") as typeof import("bullmq");
    const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379" };

    worker ??= new Worker(
      QUEUE_NAME,
      async (job: { data: { runId: string } }) => {
        await buildReport(job.data.runId);
      },
      { connection },
    );
    queue = new Queue(QUEUE_NAME, { connection }) as unknown as typeof queue;
    logger.info("social-reports", "BullMQ report queue started");
  } catch (e) {
    // Falling back rather than failing: a missing optional dependency must not
    // take reports out entirely.
    logger.error("social-reports", "BullMQ init failed; using in-process fallback", e);
    queue = null;
  }
  return queue;
}

/**
 * Hand a queued run to whatever will build it.
 *
 * Resolves as soon as the job is ACCEPTED, never when it is finished — the
 * caller is answering an HTTP request and must not wait for a PDF.
 */
export async function enqueueReport(runId: string): Promise<{ driver: "bullmq" | "in-process" }> {
  const q = ensureQueue();
  if (q) {
    await q.add("build", { runId });
    return { driver: "bullmq" };
  }

  // setImmediate, not await: the response goes out first, and the run row is
  // how the client follows progress.
  setImmediate(() => {
    void buildReport(runId).catch((e) => {
      // buildReport already marked the run failed and logged the cause; this
      // catch exists so an unhandled rejection cannot take the process down.
      logger.warn("social-reports", `in-process build for ${runId} ended in failure`, e);
    });
  });
  return { driver: "in-process" };
}
