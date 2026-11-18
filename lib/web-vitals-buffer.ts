// Batches web-vitals counts in memory and writes them every few seconds.
//
// Every page view sends up to five beacons (LCP, INP, CLS, FCP, TTFB) and each
// one used to be its own upsert. A crawler or a burst of visitors therefore
// turned into dozens of concurrent DB writes, each holding one of the 15
// session-pooler connections: CLIPIRO-WEB-9 was 34 "max clients reached"
// errors from POST /api/marketing/vitals in three minutes. Counts for the same
// (date, metric, path, bucket) now add up here and land as ONE sequential
// upsert per key per flush, on a single connection.
//
// Best-effort by design, like the beacon itself: counts buffered when the
// process exits are lost. That is a few seconds of anonymous analytics.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface VitalKey {
  date: string;
  metric: string;
  path: string;
  bucket: string;
}

export const VITALS_FLUSH_MS = 15_000;
/** A flush starts early once this many distinct keys are waiting. */
export const VITALS_MAX_KEYS = 200;

const SEP = "\u0000";

interface BufferState {
  counts: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
}

// globalThis, so every copy of this module in the process shares one buffer.
const g = globalThis as unknown as { __webVitalsBuffer?: BufferState };
const state: BufferState = (g.__webVitalsBuffer ??= { counts: new Map(), timer: null, flushing: null });

function encode(k: VitalKey): string {
  return [k.date, k.metric, k.path, k.bucket].join(SEP);
}

function decode(s: string): VitalKey {
  const [date, metric, path, bucket] = s.split(SEP);
  return { date, metric, path, bucket };
}

export function recordVital(key: VitalKey): void {
  const id = encode(key);
  state.counts.set(id, (state.counts.get(id) ?? 0) + 1);
  if (state.counts.size >= VITALS_MAX_KEYS) {
    void flushVitals();
    return;
  }
  if (!state.timer) {
    state.timer = setTimeout(() => void flushVitals(), VITALS_FLUSH_MS);
    // Never keep a process (or a test run) alive just to write analytics.
    state.timer.unref?.();
  }
}

/** Writes everything buffered so far. Safe to call concurrently. */
export async function flushVitals(): Promise<void> {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  // Chain behind a flush already in progress so two never run side by side.
  const previous = state.flushing ?? Promise.resolve();
  const run = previous.then(async () => {
    if (state.counts.size === 0) return;
    const batch = state.counts;
    state.counts = new Map();
    let failed = 0;
    let lastErr: unknown = null;
    // Sequential on purpose: one connection, however many keys.
    for (const [id, n] of batch) {
      const key = decode(id);
      try {
        await prisma.webVitalDaily.upsert({
          where: { date_metric_path_bucket: key },
          create: { ...key, count: n },
          update: { count: { increment: n } },
        });
      } catch (err) {
        failed++;
        lastErr = err;
      }
    }
    // Analytics, not a user action: a warning, once per flush.
    if (failed > 0) logger.warn("web-vitals", `failed to record ${failed}/${batch.size} vitals rows`, lastErr);
  });
  const tracked: Promise<void> = run
    .catch(() => {})
    .finally(() => {
      if (state.flushing === tracked) state.flushing = null;
    });
  state.flushing = tracked;
  return run;
}

/** Test hook: what is waiting to be written. */
export function pendingVitals(): Array<VitalKey & { count: number }> {
  return [...state.counts].map(([id, count]) => ({ ...decode(id), count }));
}
