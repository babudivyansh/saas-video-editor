import { jobSchema, startJobRequest, startJobResponse, type Job, type StartJobRequest } from "../schemas/jobs";
import type { ApiClient } from "./client";

// /api/mobile/v1/jobs: start AutoClip runs, exports and AI tool jobs, then poll.
export function jobsApi(api: ApiClient) {
  const get = (id: string) => api.request(`/jobs/${encodeURIComponent(id)}`, { schema: jobSchema });
  return {
    start: (b: StartJobRequest) => api.request("/jobs", { method: "POST", body: startJobRequest.parse(b), schema: startJobResponse }),
    get,
    /**
     * Polls until the job is done or failed, reporting progress on the way.
     * Rejects if `signal` aborts (the screen closed); the job keeps running.
     */
    async waitFor(id: string, o: { onProgress?: (job: Job) => void; intervalMs?: number; signal?: AbortSignal } = {}): Promise<Job> {
      for (;;) {
        if (o.signal?.aborted) throw o.signal.reason ?? new Error("aborted");
        const job = await get(id);
        o.onProgress?.(job);
        if (job.status === "done" || job.status === "failed") return job;
        await new Promise((r) => setTimeout(r, o.intervalMs ?? 3000));
      }
    },
  };
}
