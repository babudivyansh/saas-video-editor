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

type JobHandler<T> = (payload: T) => Promise<void>;

interface Job<T> {
  id: string;
  payload: T;
  retries: number;
}

export class InProcessQueue<T> {
  private queue: Job<T>[] = [];
  private running = false;
  private readonly MAX_RETRIES = 2;

  constructor(
    private readonly name: string,
    private readonly handler: JobHandler<T>
  ) {}

  enqueue(id: string, payload: T): void {
    this.queue.push({ id, payload, retries: 0 });
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await this.handler(job.payload);
      } catch (err) {
        logger.error(this.name, `Job ${job.id} failed`, err);
        // A video that is too short (or a plan limit, or missing credits) will
        // still be so on attempt two. Retrying costs a full source re-download
        // per attempt and reaches the identical verdict.
        if (err instanceof NonRetryableError) {
          logger.info(this.name, `Job ${job.id} failed permanently, not retrying: ${err.message}`);
        } else if (job.retries < this.MAX_RETRIES) {
          job.retries++;
          this.queue.push(job); // re-enqueue at end
          logger.info(this.name, `Retrying job ${job.id} (attempt ${job.retries})`);
        } else {
          logger.error(this.name, `Job ${job.id} exceeded max retries.`);
        }
      }
    }
    this.running = false;
  }
}

export type RenderJobPayload = {
  projectId: string;
  bgVideoUrl: string;
  voiceAudioUrl: string;
  musicUrl?: string;
  wordTimings: Array<{ word: string; start: number; end: number }>;
  subtitlesStyle: {
    fontName?: string;
    fontSize?: number;
    highlightColor?: string;
    baseColor?: string;
  };
};

// Singleton — imported by the compile API route
let _renderQueue: InProcessQueue<RenderJobPayload> | null = null;

export function getRenderQueue(
  handler: JobHandler<RenderJobPayload>
): InProcessQueue<RenderJobPayload> {
  if (!_renderQueue) {
    _renderQueue = new InProcessQueue<RenderJobPayload>("render", handler);
  }
  return _renderQueue;
}
