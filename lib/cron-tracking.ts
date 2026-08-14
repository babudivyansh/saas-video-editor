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
  "commission-payout",
  "account-purge",
  "admin-digest",
  "clip-publish",
  "social-refresh",
] as const;
export type CronName = (typeof KNOWN_CRON_NAMES)[number];

const key = (name: string) => `cron:lastrun:${name}`;
// Keep a fortnight so a weekly / low-frequency cron still shows its last run.
const TTL_SEC = 14 * 24 * 60 * 60;

/** Fire-and-forget — never throws, never blocks the cron it's attached to. */
export async function recordCronRun(name: CronName): Promise<void> {
  try {
    await redis.set(key(name), new Date().toISOString(), "EX", TTL_SEC);
  } catch (e) {
    logger.warn("cron-tracking", `failed to record run for ${name}`, e);
  }
}

export interface CronRunStatus {
  name: CronName;
  lastRunAt: string | null;
  ageSeconds: number | null;
}

/** Last-run time + age for every known cron, for the admin ops snapshot. */
export async function getCronRunStatuses(): Promise<CronRunStatus[]> {
  const now = Date.now();
  return Promise.all(
    KNOWN_CRON_NAMES.map(async (name) => {
      const lastRunAt = await redis.get(key(name)).catch(() => null);
      const ageSeconds = lastRunAt ? Math.round((now - new Date(lastRunAt).getTime()) / 1000) : null;
      return { name, lastRunAt, ageSeconds };
    }),
  );
}
