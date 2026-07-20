// Render queue abstraction. Defaults to BullMQ + Redis (already in deps) for
// parallel workers, persistence across restarts, and retry/backoff — opt out
// with RENDER_QUEUE_DRIVER=in-process to fall back to the plain in-process FIFO.
//
// Both drivers expose the same `enqueue(id, payload)` so the render route swaps
// mechanically. Progress is published to Redis (`render:{id}`) for the status
// endpoint regardless of driver.

import { InProcessQueue } from "@/lib/job-queue";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";

export type RenderStage = "queued" | "downloading" | "rendering" | "uploading" | "completed" | "failed";

export interface RenderProgress {
  stage: RenderStage;
  percent: number; // 0–100
  updatedAt: number;
}

const STAGE_PCT: Record<RenderStage, number> = {
  queued: 2, downloading: 20, rendering: 60, uploading: 90, completed: 100, failed: 0,
};

export async function setRenderProgress(projectId: string, stage: RenderStage, percent?: number) {
  const p: RenderProgress = { stage, percent: percent ?? STAGE_PCT[stage], updatedAt: Date.now() };
  try { await redis.set(`render:${projectId}`, JSON.stringify(p), "EX", 3600); } catch { /* non-fatal */ }
}

export async function getRenderProgress(projectId: string): Promise<RenderProgress | null> {
  try {
    const raw = await redis.get(`render:${projectId}`);
    return raw ? (JSON.parse(raw) as RenderProgress) : null;
  } catch { return null; }
}

export interface EnqueueOpts {
  /** BullMQ semantics: lower number = processed sooner. Tier-mapped via
   * lib/plans/tiers.ts tierPriority(); omitted = default (last). */
  priority?: number;
}

export interface RenderQueue<T> {
  enqueue: (id: string, payload: T, opts?: EnqueueOpts) => void;
  driver: "in-process" | "bullmq";
}

// Every queue name ever passed to createRenderQueue, kept in sync by hand.
// The admin ops/failed-jobs views and the job-retry/remove route need the
// full list of queues to check — a Next.js route can't reliably introspect
// which other route modules (and their own createRenderQueue calls) happen
// to have loaded in the current process, so this is the single source of
// truth rather than three separately-drifting copies of the same array.
// Update this alongside any new createRenderQueue("name", ...) call site.
export const KNOWN_RENDER_QUEUE_NAMES = [
  "editor-render",
  "auto-clip-pick",
  "auto-clip-render",
  "auto-clip-rerender",
  "auto-clip-dub",
  "video-compressor",
  "asset-moderation",
  "asset-zip",
  "account-export",
] as const;
export type RenderQueueName = typeof KNOWN_RENDER_QUEUE_NAMES[number];

type Handler<T> = (payload: T) => Promise<void>;

// Cached by queue name (via globalThis, so it survives Next.js dev hot-reload
// like the job Maps elsewhere in this codebase) so both instrumentation.ts
// (boot-time worker start) and a route module's top-level `createRenderQueue`
// call resolve to the same Queue/Worker instead of double-starting one.
const g = globalThis as unknown as { __renderQueues?: Map<string, RenderQueue<unknown>> };
const queueCache = g.__renderQueues ?? (g.__renderQueues = new Map());

// Create (or reuse) a render queue. The handler should accept a payload that
// includes a `projectId` so progress can be tracked.
export function createRenderQueue<T extends { projectId: string }>(name: string, handler: Handler<T>): RenderQueue<T> {
  const cached = queueCache.get(name);
  if (cached) return cached as RenderQueue<T>;

  const wrapped: Handler<T> = async (payload) => {
    await setRenderProgress(payload.projectId, "queued");
    try {
      await handler(payload);
      await setRenderProgress(payload.projectId, "completed");
    } catch (e) {
      await setRenderProgress(payload.projectId, "failed");
      throw e;
    }
  };

  let result: RenderQueue<T>;
  if (env.RENDER_QUEUE_DRIVER !== "in-process") {
    try {
      result = makeBullQueue(name, wrapped);
    } catch (e) {
      logger.error("render-queue", "BullMQ init failed, falling back to in-process", e);
      const q = new InProcessQueue<T>(name, wrapped);
      result = { enqueue: (id, payload) => q.enqueue(id, payload), driver: "in-process" };
    }
  } else {
    const q = new InProcessQueue<T>(name, wrapped);
    result = { enqueue: (id, payload) => q.enqueue(id, payload), driver: "in-process" };
  }

  queueCache.set(name, result);
  return result;
}

// BullMQ driver — lazily required so the in-process path has zero BullMQ overhead.
function makeBullQueue<T extends { projectId: string }>(name: string, handler: Handler<T>): RenderQueue<T> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Queue, Worker } = require("bullmq") as typeof import("bullmq");
  const connection = { url: env.REDIS_URL || "redis://127.0.0.1:6379" };
  const concurrency = parseInt(env.RENDER_CONCURRENCY || "2", 10);

  const queue = new Queue(name, { connection });
  // One in-process worker per server; concurrency controls parallel renders.
  new Worker(
    name,
    async (job: { data: T }) => { await handler(job.data); },
    { connection, concurrency },
  );
  // Liveness signal for the admin ops page.
  void import("@/lib/worker-heartbeat").then(({ startHeartbeat }) => startHeartbeat(name));

  return {
    driver: "bullmq",
    enqueue: (id, payload, opts) => {
      void queue.add(name, payload, {
        jobId: id,
        // BullMQ: lower priority number = dequeued first (real tier-based
        // priority rendering — Pro/Studio jobs jump the free-tier queue).
        ...(opts?.priority != null ? { priority: opts.priority } : {}),
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      });
    },
  };
}
