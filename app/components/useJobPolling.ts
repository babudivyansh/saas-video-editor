"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Shared client-side polling for the job-map tool routes (cut-and-crop,
// voice-changer, subtitle-remover, ai-creator, ...). Every one of these tools
// used to hand-roll its own setInterval polling loop; each copy had
// independently drifted (some treated a 404/lost job as transient-retry and
// polled forever, none gave up after a max duration, none cleaned up their
// interval on unmount, none survived a page refresh). This hook fixes all of
// that in one place.

export type JobStatus = "idle" | "processing" | "done" | "error" | "cancelled";

export interface UseJobPollingOptions {
  /** Matches the tool's API route path under /api/tools/<toolSlug>. */
  toolSlug: string;
  /** Current auth token (from useAuth()) — kept in a ref internally so
   * callers don't need to worry about stale closures. */
  token: string | null;
  /** Set false for tools whose route allows anonymous access (matches
   * `createJobStatusHandler`'s `allowAnonymous` option) — polling and
   * resume-after-refresh proceed without waiting for a token to exist; the
   * Authorization header is still sent whenever a token happens to be
   * present. Defaults to true (matches every tool except the 3 free ones). */
  requireAuth?: boolean;
  pollIntervalMs?: number;
  /** Give up and show a timeout error after this long with no terminal
   * status — previously these loops ran forever if a job never resolved. */
  maxDurationMs?: number;
}

export interface UseJobPolling {
  jobId: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
  /** Route-specific informational payload passed through from the poll
   * response's `meta` field as-is, if the route sets one (most don't). */
  meta: Record<string, unknown> | null;
  /** Call with a function that POSTs the job and resolves { jobId }. Persists
   * the jobId so a page refresh can resume polling it. */
  start: (submit: () => Promise<{ jobId: string }>) => Promise<void>;
  /** Best-effort cancel: calls DELETE on the route, which refunds credits and
   * stops billing for further work server-side. */
  cancel: () => Promise<void>;
  /** Re-runs the last `start()` submit function, e.g. after an error. */
  retry: () => void;
  reset: () => void;
}

interface StoredJob {
  jobId: string;
}

export function useJobPolling(opts: UseJobPollingOptions): UseJobPolling {
  const { toolSlug, requireAuth = true, pollIntervalMs = 2000, maxDurationMs = 10 * 60 * 1000 } = opts;
  const storageKey = `job:${toolSlug}`;

  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);

  const tokenRef = useRef(opts.token);
  useEffect(() => { tokenRef.current = opts.token; }, [opts.token]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef(0);
  const lastSubmitRef = useRef<(() => Promise<{ jobId: string }>) | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Always clear the interval on unmount — every hand-rolled version of this
  // loop across the 4 tools was missing this.
  useEffect(() => stopPolling, [stopPolling]);

  const finish = useCallback((next: JobStatus, errMsg?: string) => {
    stopPolling();
    setStatus(next);
    if (errMsg !== undefined) setError(errMsg);
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [stopPolling, storageKey]);

  const poll = useCallback((id: string) => {
    stopPolling();
    pollStartRef.current = Date.now();
    intervalRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > maxDurationMs) {
        finish("error", "This is taking longer than expected. Please try again.");
        return;
      }
      const token = tokenRef.current;
      if (requireAuth && !token) return; // not logged in yet — wait for token to appear
      try {
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`/api/tools/${toolSlug}?jobId=${id}`, { headers });
        // A 404 means the job is gone (swept, or the server restarted) — this
        // is terminal, not transient. Every prior hand-rolled loop treated
        // this as "keep trying," which polled forever.
        if (res.status === 404) {
          finish("error", "This job could not be found — it may have expired.");
          return;
        }
        if (!res.ok) return; // other transient failures: keep polling
        const data = (await res.json()) as { progress?: number; status?: string; error?: string; meta?: Record<string, unknown> };
        if (typeof data.progress === "number") setProgress(data.progress);
        if (data.meta) setMeta(data.meta);
        if (data.status === "done") finish("done");
        else if (data.status === "error") finish("error", data.error ?? "Something went wrong.");
        else if (data.status === "cancelled") finish("cancelled");
        // otherwise still processing — keep polling
      } catch {
        // network blip — keep polling, bounded by maxDurationMs above
      }
    }, pollIntervalMs);
  }, [toolSlug, pollIntervalMs, maxDurationMs, stopPolling, finish, requireAuth]);

  // Resume an in-flight job after a refresh. Auth-required tools wait for a
  // token to appear; anonymous-capable tools (requireAuth: false) resume
  // immediately since there's nothing to wait for.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (requireAuth && !opts.token) return;
    let stored: string | null;
    try { stored = sessionStorage.getItem(storageKey); } catch { stored = null; }
    if (!stored) return;
    try {
      const { jobId: storedId } = JSON.parse(stored) as StoredJob;
      setJobId(storedId);
      setStatus("processing");
      poll(storedId);
    } catch {
      try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
    }
    // Only re-run when the token transitions from absent to present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.token, requireAuth]);

  const start = useCallback(async (submit: () => Promise<{ jobId: string }>) => {
    lastSubmitRef.current = submit;
    setError(null);
    setProgress(0);
    setMeta(null);
    setStatus("processing");
    try {
      const { jobId: id } = await submit();
      setJobId(id);
      try { sessionStorage.setItem(storageKey, JSON.stringify({ jobId: id } satisfies StoredJob)); } catch { /* ignore */ }
      poll(id);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [poll, storageKey]);

  const cancel = useCallback(async () => {
    if (!jobId) return;
    stopPolling();
    const token = tokenRef.current;
    try {
      if (token) {
        await fetch(`/api/tools/${toolSlug}?jobId=${jobId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch { /* best-effort */ }
    setStatus("cancelled");
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [jobId, toolSlug, stopPolling, storageKey]);

  const retry = useCallback(() => {
    if (lastSubmitRef.current) void start(lastSubmitRef.current);
  }, [start]);

  const reset = useCallback(() => {
    stopPolling();
    setJobId(null);
    setStatus("idle");
    setProgress(0);
    setError(null);
    setMeta(null);
    try { sessionStorage.removeItem(storageKey); } catch { /* ignore */ }
  }, [stopPolling, storageKey]);

  return { jobId, status, progress, error, meta, start, cancel, retry, reset };
}
