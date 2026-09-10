import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";

// Records the last time each cron endpoint was actually hit by the external
// scheduler, so admin ops can surface an unscheduled cron as "never / stale"
// instead of it failing silently and invisibly. SETUP.md §7 warns that most
// crons weren't wired into the production crontab as of the 2026-08 audit, and
// there was no way to see that from inside the app. Stored in Redis (same as
// worker heartbeats) — this is liveness telemetry, not durable business data,
// so a Redis flush degrading it to "unknown" is acceptable.

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
// Keep a fortnight so a weekly / low-frequency cron still shows its last run.
const TTL_SEC = 14 * 24 * 60 * 60;

/**
 * Fire-and-forget — never throws, never blocks the cron it's attached to.
 * Pass `job` for a ?job= route, and pass it AFTER the job has been resolved
 * and validated, or you re-create the false-green this split exists to fix.
 */
export async function recordCronRun(name: CronName, job?: string): Promise<void> {
  const id = job ? `${name}:${job}` : name;
  try {
    await redis.set(key(id), new Date().toISOString(), "EX", TTL_SEC);
  } catch (e) {
    logger.warn("cron-tracking", `failed to record run for ${id}`, e);
  }
}

export interface CronRunStatus {
  /** "mrr-snapshot", or "social-refresh:scores" for a ?job= route. */
  name: CronRunId;
  lastRunAt: string | null;
  ageSeconds: number | null;
}

/** Last-run time + age for every known cron, for the admin ops snapshot. */
export async function getCronRunStatuses(): Promise<CronRunStatus[]> {
  const now = Date.now();
  return Promise.all(
    KNOWN_CRON_RUN_IDS.map(async (name) => {
      const lastRunAt = await redis.get(key(name)).catch(() => null);
      const ageSeconds = lastRunAt ? Math.round((now - new Date(lastRunAt).getTime()) / 1000) : null;
      return { name, lastRunAt, ageSeconds };
    }),
  );
}
