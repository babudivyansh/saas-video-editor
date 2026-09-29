import type { NextRequest } from "next/server";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

// Records the last time each cron endpoint was actually hit by the external
// scheduler, so admin ops can surface an unscheduled cron as "never / stale"
// instead of it failing silently and invisibly. SETUP.md §7 warns that most
// crons weren't wired into the production crontab as of the 2026-08 audit, and
// there was no way to see that from inside the app. Stored in Redis (same as
// worker heartbeats) — this is liveness telemetry, not durable business data,
// so a Redis flush degrading it to "unknown" is acceptable.
//
// It records OUTCOMES, not just hits. The first version stamped "last run" at
// the top of each route, before the work — so a cron that threw on every run
// still showed green. Routes now export `withCronTracking(name, handler)`,
// which records when the run finished and whether it succeeded.

export const KNOWN_CRON_NAMES = [
  "refill-credits",
  "subscription-reminder",
  "review-drip",
  "review-prompts",
  "reengagement",
  "onboarding",
  "asset-cleanup",
  "stale-clip-sweep",
  "dub-sweep",
  "submagic-sweep",
  "commission-payout",
  "account-purge",
  "admin-digest",
  "clip-publish",
  "social-refresh",
  "feature-announcements",
  "mrr-snapshot",
] as const;
export type CronName = (typeof KNOWN_CRON_NAMES)[number];

// Routes that dispatch on `?job=` rather than doing one thing.
//
// These have to be tracked per-job, not per-route. social-refresh recorded a
// run for the bare route name before it looked at `?job=`, so the hourly
// default job kept the whole route reading "fresh" — and five of its eight
// jobs had never been scheduled at all, invisibly, for months. A route-level
// heartbeat cannot tell you that.
//
// Deliberately NOT folded into KNOWN_CRON_NAMES: scripts/check-cron-coverage.mjs
// requires every name there to have a matching app/api/cron/<name> directory,
// and "social-refresh:scores" is a query parameter, not a route.
// The FIRST job listed is the route's default — the one a bare crontab line
// with no ?job= runs. check-cron-coverage.mjs relies on that ordering.
export const KNOWN_CRON_JOBS = {
  "asset-cleanup": ["orphans", "retention"],
  "social-refresh": [
    "refresh",
    "retention",
    "digest",
    "daily-metrics",
    "scores",
    "reports",
    "goals",
    "recalibrate-virality",
  ],
} as const;

type JobbedCron = keyof typeof KNOWN_CRON_JOBS;
type JobRunId = {
  [K in JobbedCron]: `${K}:${(typeof KNOWN_CRON_JOBS)[K][number]}`;
}[JobbedCron];

/** One tracked unit: a bare route name, or "<route>:<job>" for a ?job= route. */
export type CronRunId = Exclude<CronName, JobbedCron> | JobRunId;

export const KNOWN_CRON_RUN_IDS: readonly CronRunId[] = [
  ...KNOWN_CRON_NAMES.filter((n): n is Exclude<CronName, JobbedCron> => !(n in KNOWN_CRON_JOBS)),
  ...Object.entries(KNOWN_CRON_JOBS).flatMap(([name, jobs]) =>
    jobs.map((job) => `${name}:${job}` as JobRunId),
  ),
];

const key = (id: string) => `cron:lastrun:${id}`;
const okKey = (id: string) => `cron:lastok:${id}`;
const failKey = (id: string) => `cron:lastfail:${id}`;
// Keep a fortnight so a weekly / low-frequency cron still shows its last run.
const TTL_SEC = 14 * 24 * 60 * 60;

/**
 * Stamps a run as finished (and, with `outcome`, how it went). Never throws,
 * never blocks the cron it's attached to. Pass `job` for a ?job= route, and
 * pass it AFTER the job has been resolved and validated, or you re-create the
 * false-green the per-job split exists to fix.
 */
export async function recordCronRun(
  name: CronName,
  job?: string,
  outcome?: { ok: true } | { ok: false; error: string },
): Promise<void> {
  const id = job ? `${name}:${job}` : name;
  const at = new Date().toISOString();
  try {
    await redis.set(key(id), at, "EX", TTL_SEC);
    if (outcome?.ok) await redis.set(okKey(id), at, "EX", TTL_SEC);
    else if (outcome) {
      await redis.set(failKey(id), JSON.stringify({ at, error: outcome.error.slice(0, 300) }), "EX", TTL_SEC);
    }
  } catch (e) {
    logger.warn("cron-tracking", `failed to record run for ${id}`, e);
  }
}

/**
 * The run id a request is for: the bare name, or "<name>:<job>" for a ?job=
 * route (the FIRST listed job is the route's default). Null for a job the
 * route doesn't know — that request is a 400, not a run.
 */
function runJobFor(name: CronName, req: NextRequest): { job?: string } | null {
  const jobs = (KNOWN_CRON_JOBS as Record<string, readonly string[]>)[name];
  if (!jobs) return {};
  const job = req.nextUrl.searchParams.get("job") ?? jobs[0];
  return jobs.includes(job) ? { job } : null;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Wraps a cron route handler so every run records its OUTCOME once it ends:
 *   2xx          → succeeded
 *   5xx / throws → failed (the error is kept for the admin ops page)
 *   4xx          → not a run at all (bad secret, unknown ?job=) — recorded
 *                  as nothing, so a scanner hitting the URL can't fake a run.
 * Partial failures a route handles itself (one user's email bouncing) still
 * answer 2xx and count as a successful run, which is what they are.
 */
export function withCronTracking<Args extends unknown[]>(
  name: CronName,
  handler: (req: NextRequest, ...args: Args) => Promise<Response>,
): (req: NextRequest, ...args: Args) => Promise<Response> {
  return async (req, ...args) => {
    const run = runJobFor(name, req);
    let res: Response;
    try {
      res = await handler(req, ...args);
    } catch (e) {
      if (run) await recordCronRun(name, run.job, { ok: false, error: describe(e) });
      throw e;
    }
    if (run && res.status >= 500) {
      const body = await res.clone().json().catch(() => null) as { error?: unknown } | null;
      await recordCronRun(name, run.job, { ok: false, error: typeof body?.error === "string" ? body.error : `HTTP ${res.status}` });
    } else if (run && res.status < 400) {
      await recordCronRun(name, run.job, { ok: true });
    }
    return res;
  };
}

export interface CronRunStatus {
  /** "mrr-snapshot", or "social-refresh:scores" for a ?job= route. */
  name: CronRunId;
  /** When the last run (of either outcome) finished. */
  lastRunAt: string | null;
  ageSeconds: number | null;
  lastSuccessAt: string | null;
  /** Age of the last SUCCESS — what staleness is judged on. */
  successAgeSeconds: number | null;
  lastFailureAt: string | null;
  lastError: string | null;
  /** The most recent run failed (a success since then clears it). */
  failing: boolean;
}

const age = (iso: string | null, now: number) => (iso ? Math.round((now - new Date(iso).getTime()) / 1000) : null);

/** Last run, last success and last failure for every known cron, for admin ops. */
export async function getCronRunStatuses(): Promise<CronRunStatus[]> {
  const now = Date.now();
  return Promise.all(
    KNOWN_CRON_RUN_IDS.map(async (name) => {
      const [lastRunAt, lastSuccessAt, failRaw] = await Promise.all([
        redis.get(key(name)).catch(() => null),
        redis.get(okKey(name)).catch(() => null),
        redis.get(failKey(name)).catch(() => null),
      ]);
      let lastFailureAt: string | null = null;
      let lastError: string | null = null;
      if (failRaw) {
        try {
          const f = JSON.parse(failRaw) as { at?: string; error?: string };
          lastFailureAt = f.at ?? null;
          lastError = f.error ?? null;
        } catch { /* ignore a malformed entry */ }
      }
      const failing = !!lastFailureAt && (!lastSuccessAt || lastFailureAt > lastSuccessAt);
      return {
        name,
        lastRunAt,
        ageSeconds: age(lastRunAt, now),
        lastSuccessAt,
        successAgeSeconds: age(lastSuccessAt, now),
        lastFailureAt,
        lastError,
        failing,
      };
    }),
  );
}
