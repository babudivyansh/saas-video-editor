/**
 * Simple in-process job queue backed by an async FIFO.
 * For production scale, swap this for BullMQ on Redis.
 *
 * Chosen over BullMQ for Slice 1 to keep the setup dependency-light;
 * the interface is identical so the swap is mechanical.
 */

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
        console.error(`[${this.name}] Job ${job.id} failed:`, err);
        if (job.retries < this.MAX_RETRIES) {
          job.retries++;
          this.queue.push(job); // re-enqueue at end
          console.log(`[${this.name}] Retrying job ${job.id} (attempt ${job.retries})`);
        } else {
          console.error(`[${this.name}] Job ${job.id} exceeded max retries.`);
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
