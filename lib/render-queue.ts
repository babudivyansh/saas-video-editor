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

export interface RenderQueue<T> {
  enqueue: (id: string, payload: T) => void;
  driver: "in-process" | "bullmq";
}

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

  return {
    driver: "bullmq",
    enqueue: (id, payload) => {
      void queue.add(name, payload, {
        jobId: id,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      });
    },
  };
}
