/**
 * Simple in-process job queue backed by an async FIFO.
 * For production scale, swap this for BullMQ on Redis.
 *
 * Chosen over BullMQ for Slice 1 to keep the setup dependency-light;
 * the interface is identical so the swap is mechanical.
 */

import { logger } from "@/lib/logger";

/**
 * A failure that retrying cannot fix: bad input, a plan limit, insufficient
 * credits. Defined HERE rather than in lib/render-queue.ts so both queue
 * drivers can honour it — render-queue imports this module, so the reverse
 * direction would be a cycle.
 *
 * This lived only in the BullMQ path at first, which meant the in-process
 * driver (what production actually runs) kept retrying unretryable jobs three
 * times, each attempt re-downloading the whole source video to reach the same
 * verdict. The message is user-facing: it is persisted to
 * Project.failureReason and shown in the UI.
 */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

/**
 * Which attempt this is. Handlers that charged credits need it: refunding on
 * a failure that is about to be RETRIED would let the later, successful
 * attempt run for free, while never refunding strands the charge when the
 * last attempt fails too. So refunds belong to the final attempt only — see
 * pickJob/renderJob in lib/autoclip-pipeline.ts. A NonRetryableError is
 * always final, whatever this says.
 */
export interface JobContext {
  /** 1-based. */
  attempt: number;
  /** True when a failure of this attempt will not be retried. */
  isFinal: boolean;
}

export type JobHandler<T> = (payload: T, ctx: JobContext) => Promise<void>;

interface Job<T> {
  id: string;
  payload: T;
  retries: number;
  enqueuedAt: number;
}

/** A job that ran out of attempts (or failed non-retryably), kept for the admin Queues tab. */
export interface InProcessFailedJob<T = unknown> {
  id: string;
  payload: T;
  attempts: number;
  error: string;
  failedAt: number;
}

export interface InProcessSnapshot<T = unknown> {
  name: string;
  paused: boolean;
  active: { id: string; payload: T; attempt: number; startedAt: number } | null;
  waiting: Array<{ id: string; payload: T; attempt: number; enqueuedAt: number }>;
  failed: InProcessFailedJob<T>[];
  completedTotal: number;
  failedTotal: number;
}

// Every in-process queue this server process has created, by name, so the
// admin Queues tab can inspect and act on them. In-process queues live in the
// memory of ONE process — this is that process's view, nothing more.
const reg = globalThis as unknown as { __inProcessQueues?: Map<string, InProcessQueue<unknown>> };
export const inProcessQueues: Map<string, InProcessQueue<unknown>> = reg.__inProcessQueues ?? (reg.__inProcessQueues = new Map());

const MAX_FAILED_KEPT = 50;

export class InProcessQueue<T> {
  private queue: Job<T>[] = [];
  private running = false;
  private paused = false;
  private active: (Job<T> & { startedAt: number }) | null = null;
  private failed: InProcessFailedJob<T>[] = [];
  private completedTotal = 0;
  private failedTotal = 0;
  private readonly MAX_RETRIES = 2;

  constructor(
    private readonly name: string,
    private readonly handler: JobHandler<T>
  ) {
    inProcessQueues.set(name, this as unknown as InProcessQueue<unknown>);
  }

  enqueue(id: string, payload: T): void {
    this.queue.push({ id, payload, retries: 0, enqueuedAt: Date.now() });
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0 && !this.paused) {
      const job = this.queue.shift()!;
      this.active = { ...job, startedAt: Date.now() };
      try {
        await this.handler(job.payload, {
          attempt: job.retries + 1,
          isFinal: job.retries >= this.MAX_RETRIES,
        });
        this.completedTotal++;
      } catch (err) {
        logger.error(this.name, `Job ${job.id} failed`, err);
        // A video that is too short (or a plan limit, or missing credits) will
        // still be so on attempt two. Retrying costs a full source re-download
        // per attempt and reaches the identical verdict.
        if (err instanceof NonRetryableError) {
          logger.info(this.name, `Job ${job.id} failed permanently, not retrying: ${err.message}`);
          this.recordFailure(job, err);
        } else if (job.retries < this.MAX_RETRIES) {
          job.retries++;
          this.queue.push(job); // re-enqueue at end
          logger.info(this.name, `Retrying job ${job.id} (attempt ${job.retries})`);
        } else {
          logger.error(this.name, `Job ${job.id} exceeded max retries.`);
          this.recordFailure(job, err);
        }
      } finally {
        this.active = null;
      }
    }
    this.running = false;
  }

  private recordFailure(job: Job<T>, err: unknown) {
    this.failedTotal++;
    this.failed.unshift({
      id: job.id,
      payload: job.payload,
      attempts: job.retries + 1,
      error: err instanceof Error ? err.message : String(err),
      failedAt: Date.now(),
    });
    this.failed.length = Math.min(this.failed.length, MAX_FAILED_KEPT);
  }

  // ── Admin controls (the Queues tab) ──────────────────────────────────────

  snapshot(): InProcessSnapshot<T> {
    return {
      name: this.name,
      paused: this.paused,
      active: this.active
        ? { id: this.active.id, payload: this.active.payload, attempt: this.active.retries + 1, startedAt: this.active.startedAt }
        : null,
      waiting: this.queue.map((j) => ({ id: j.id, payload: j.payload, attempt: j.retries + 1, enqueuedAt: j.enqueuedAt })),
      failed: [...this.failed],
      completedTotal: this.completedTotal,
      failedTotal: this.failedTotal,
    };
  }

  /** Stop starting new jobs (the running one finishes). */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    if (!this.running && this.queue.length > 0) void this.drain();
  }

  /** Re-queue one failed job with fresh attempts. False if it isn't in the failed set. */
  retryFailed(id: string): boolean {
    const i = this.failed.findIndex((f) => f.id === id);
    if (i < 0) return false;
    const [f] = this.failed.splice(i, 1);
    this.enqueue(f.id, f.payload);
    return true;
  }

  retryAllFailed(): number {
    const all = this.failed.splice(0);
    for (const f of all) this.enqueue(f.id, f.payload);
    return all.length;
  }

  removeFailed(id: string): boolean {
    const i = this.failed.findIndex((f) => f.id === id);
    if (i >= 0) this.failed.splice(i, 1);
    return i >= 0;
  }

  clearFailed(): number {
    return this.failed.splice(0).length;
  }

  /** Drop one waiting job. False if it isn't waiting (it may have started). */
  removeWaiting(id: string): boolean {
    const i = this.queue.findIndex((j) => j.id === id);
    if (i >= 0) this.queue.splice(i, 1);
    return i >= 0;
  }

  /** Drop every waiting job. The running job is not touched. */
  drainWaiting(): number {
    return this.queue.splice(0).length;
  }
}
