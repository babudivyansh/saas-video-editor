import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { inProcessQueues } from "@/lib/job-queue";
import { KNOWN_RENDER_QUEUE_NAMES, type RenderQueueName } from "@/lib/render-queue";

// Driver-aware inspection + control of the render queues for the admin Queues
// tab. BullMQ state lives in Redis and is read with a short-lived Queue handle;
// in-process state lives in this server process's memory (lib/job-queue.ts).

export type QueueDriver = "bullmq" | "in-process";
export type JobState = "waiting" | "active" | "delayed" | "failed" | "completed";
export const JOB_STATES: readonly JobState[] = ["waiting", "active", "delayed", "failed", "completed"];

export const queueDriver = (): QueueDriver => (env.RENDER_QUEUE_DRIVER === "in-process" ? "in-process" : "bullmq");

export function isKnownQueue(name: string): name is RenderQueueName {
  return (KNOWN_RENDER_QUEUE_NAMES as readonly string[]).includes(name);
}

export interface QueueSummary {
  name: string;
  driver: QueueDriver;
  /** In-process only: false when this process never created the queue. */
  started: boolean;
  paused: boolean;
  counts: Record<JobState, number>;
}

export interface QueueJob {
  id: string;
  state: JobState;
  projectId: string | null;
  attempts: number;
  error: string | null;
  stack: string | null;
  /** When it was enqueued / started / failed, whichever the state implies. */
  at: number | null;
  /** The payload, secrets redacted, trimmed for display. */
  data: string;
}

const SECRETISH = /token|secret|password|signature|authorization|apikey|api_key/i;

/** JSON of a payload with anything secret-looking blanked out, capped at 2 KB. */
export function redactPayload(payload: unknown): string {
  const json = JSON.stringify(payload ?? null, (k, v) => (k && SECRETISH.test(k) ? "[redacted]" : v), 2) ?? "null";
  // Presigned URLs carry their signature in the query string.
  const noSigs = json.replace(/([?&](?:X-Amz-[A-Za-z]+|Signature|Expires|token)=)[^&"\s]+/g, "$1[redacted]");
  return noSigs.length > 2000 ? `${noSigs.slice(0, 2000)}\n…(truncated)` : noSigs;
}

const projectIdOf = (p: unknown) => ((p as { projectId?: unknown })?.projectId as string | undefined) ?? null;
const emptyCounts = (): Record<JobState, number> => ({ waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 });

// ── BullMQ plumbing ──────────────────────────────────────────────────────────

async function withBullQueue<R>(name: string, fn: (q: import("bullmq").Queue) => Promise<R>): Promise<R> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Queue } = require("bullmq") as typeof import("bullmq");
  const queue = new Queue(name, {
    // One-shot admin read/write: fail fast, never reconnect-loop.
    connection: { url: env.REDIS_URL || "redis://127.0.0.1:6379", retryStrategy: () => null, maxRetriesPerRequest: 1 },
  });
  queue.on("error", (e) => logger.warn("admin-queues", `queue ${name} error`, e));
  try {
    return await fn(queue);
  } finally {
    await queue.close();
  }
}

const bullState = (s: JobState) => (s === "waiting" ? "wait" : s);

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listQueues(): Promise<QueueSummary[] | null> {
  const driver = queueDriver();
  if (driver === "in-process") {
    return KNOWN_RENDER_QUEUE_NAMES.map((name) => {
      const q = inProcessQueues.get(name);
      if (!q) return { name, driver, started: false, paused: false, counts: emptyCounts() };
      const s = q.snapshot();
      return {
        name,
        driver,
        started: true,
        paused: s.paused,
        counts: { waiting: s.waiting.length, active: s.active ? 1 : 0, delayed: 0, failed: s.failed.length, completed: s.completedTotal },
      };
    });
  }
  if (!(await redis.ping())) return null;
  try {
    return await Promise.all(
      KNOWN_RENDER_QUEUE_NAMES.map((name) =>
        withBullQueue(name, async (q) => {
          const [c, paused] = await Promise.all([q.getJobCounts("wait", "active", "delayed", "failed", "completed"), q.isPaused()]);
          return {
            name,
            driver,
            started: true,
            paused,
            counts: { waiting: c.wait ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, completed: c.completed ?? 0 },
          };
        }),
      ),
    );
  } catch (e) {
    logger.warn("admin-queues", "queue list unavailable", { reason: (e as Error).message });
    return null;
  }
}

export async function listJobs(name: RenderQueueName, state: JobState, limit = 50): Promise<QueueJob[]> {
  if (queueDriver() === "in-process") {
    const q = inProcessQueues.get(name);
    if (!q) return [];
    const s = q.snapshot();
    if (state === "active" && s.active) {
      return [{ id: s.active.id, state, projectId: projectIdOf(s.active.payload), attempts: s.active.attempt, error: null, stack: null, at: s.active.startedAt, data: redactPayload(s.active.payload) }];
    }
    if (state === "waiting") {
      return s.waiting.slice(0, limit).map((j) => ({ id: j.id, state, projectId: projectIdOf(j.payload), attempts: j.attempt, error: null, stack: null, at: j.enqueuedAt, data: redactPayload(j.payload) }));
    }
    if (state === "failed") {
      return s.failed.slice(0, limit).map((f) => ({ id: f.id, state, projectId: projectIdOf(f.payload), attempts: f.attempts, error: f.error, stack: null, at: f.failedAt, data: redactPayload(f.payload) }));
    }
    // The in-process driver keeps no delayed or completed jobs, only a count.
    return [];
  }
  return withBullQueue(name, async (q) => {
    const jobs = await q.getJobs([bullState(state)], 0, limit - 1, state !== "waiting");
    return jobs.filter(Boolean).map((j) => ({
      id: String(j.id),
      state,
      projectId: projectIdOf(j.data),
      attempts: j.attemptsMade,
      error: j.failedReason || null,
      stack: j.stacktrace?.length ? j.stacktrace[j.stacktrace.length - 1].slice(0, 4000) : null,
      at: j.finishedOn ?? j.processedOn ?? j.timestamp ?? null,
      data: redactPayload(j.data),
    }));
  });
}

/** Failed jobs across every queue, newest first — the Overview/queue badge list. */
export async function listAllFailed(limit = 50): Promise<Array<QueueJob & { queueName: string }>> {
  // Redis down: answer empty rather than open 15 connections that each fail.
  if (queueDriver() === "bullmq" && !(await redis.ping())) return [];
  const all = await Promise.all(
    KNOWN_RENDER_QUEUE_NAMES.map(async (name) =>
      (await listJobs(name, "failed", limit).catch(() => [])).map((j) => ({ ...j, queueName: name })),
    ),
  );
  return all.flat().sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, limit);
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type QueueAction =
  | "retry"
  | "remove"
  | "retry-all-failed"
  | "clean-failed"
  | "clean-completed"
  | "pause"
  | "resume"
  | "drain-waiting";

/** Actions that destroy queued work — the admin must type the queue name. */
export const DESTRUCTIVE_QUEUE_ACTIONS: readonly QueueAction[] = ["drain-waiting", "clean-failed"];

export class QueueActionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/** Runs one action; returns how many jobs it touched. */
export async function runQueueAction(name: RenderQueueName, action: QueueAction, jobId?: string): Promise<{ affected: number }> {
  const needsJob = action === "retry" || action === "remove";
  if (needsJob && !jobId) throw new QueueActionError("jobId is required for this action");

  if (queueDriver() === "in-process") {
    const q = inProcessQueues.get(name);
    if (!q) throw new QueueActionError("This queue hasn't started in this server process yet — nothing to act on", 409);
    switch (action) {
      case "retry":
        if (!q.retryFailed(jobId!)) throw new QueueActionError("Job not in the failed set (already retried or removed?)", 404);
        return { affected: 1 };
      case "remove":
        if (!q.removeFailed(jobId!) && !q.removeWaiting(jobId!)) throw new QueueActionError("Job not found — it may have started or finished", 404);
        return { affected: 1 };
      case "retry-all-failed": return { affected: q.retryAllFailed() };
      case "clean-failed": return { affected: q.clearFailed() };
      case "clean-completed": return { affected: 0 }; // nothing is kept
      case "pause": q.pause(); return { affected: 0 };
      case "resume": q.resume(); return { affected: 0 };
      case "drain-waiting": return { affected: q.drainWaiting() };
    }
  }

  return withBullQueue(name, async (q) => {
    switch (action) {
      case "retry":
      case "remove": {
        const job = await q.getJob(jobId!);
        if (!job) throw new QueueActionError("Job not found (it may have been cleaned up)", 404);
        if (action === "retry") await job.retry();
        else await job.remove();
        return { affected: 1 };
      }
      case "retry-all-failed": {
        const n = await q.getFailedCount();
        await q.retryJobs({ state: "failed", count: 1000 });
        return { affected: n };
      }
      case "clean-failed": return { affected: (await q.clean(0, 10_000, "failed")).length };
      case "clean-completed": return { affected: (await q.clean(0, 10_000, "completed")).length };
      case "pause": await q.pause(); return { affected: 0 };
      case "resume": await q.resume(); return { affected: 0 };
      case "drain-waiting": {
        const n = await q.getWaitingCount();
        await q.drain();
        return { affected: n };
      }
    }
  });
}
