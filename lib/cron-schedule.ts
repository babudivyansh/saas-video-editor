// The production cron schedule as data, for hosts that can't run a crontab.
//
// Hostinger's Node.js hosting has no cron and blocks `crontab` over SSH, so
// the jobs in ops/crontab never ran there. Instead ONE external request per
// minute hits /api/cron-tick (see that route), which runs whatever is due
// from this list. ops/crontab stays the human-readable source of truth for
// hosts that do have cron; lib/cron-schedule.test.ts fails if the two ever
// disagree, so neither can drift.
//
// Times are UTC.

export type CronSecretEnv = "CRON_SECRET" | "SOCIAL_REFRESH_SECRET" | "ASSET_CLEANUP_SECRET";

export interface CronScheduleEntry {
  /** Standard 5-field cron expression: minute hour day-of-month month day-of-week. */
  schedule: string;
  /** Route path, including ?job= for dispatching routes. */
  path: string;
  /** Which env var carries this route's bearer secret. */
  secret: CronSecretEnv;
}

export const CRON_SCHEDULE: readonly CronScheduleEntry[] = [
  { schedule: "0 3 * * *", path: "/api/cron/refill-credits", secret: "CRON_SECRET" },
  { schedule: "0 * * * *", path: "/api/cron/social-refresh", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 3 * * 1", path: "/api/cron/social-refresh?job=retention", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 8 * * 1", path: "/api/cron/social-refresh?job=digest", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "30 2 * * *", path: "/api/cron/social-refresh?job=daily-metrics", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 3 * * *", path: "/api/cron/social-refresh?job=scores", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "15 3 * * *", path: "/api/cron/social-refresh?job=goals", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 6 * * *", path: "/api/cron/social-refresh?job=reports", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 5 * * 1", path: "/api/cron/social-refresh?job=recalibrate-virality", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 4 * * *", path: "/api/cron/commission-payout", secret: "CRON_SECRET" },
  { schedule: "0 8 * * 1", path: "/api/cron/admin-digest", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "15 3 * * *", path: "/api/cron/mrr-snapshot", secret: "SOCIAL_REFRESH_SECRET" },
  { schedule: "0 2 * * *", path: "/api/cron/account-purge", secret: "CRON_SECRET" },
  { schedule: "*/15 * * * *", path: "/api/cron/asset-cleanup", secret: "ASSET_CLEANUP_SECRET" },
  { schedule: "0 5 * * *", path: "/api/cron/asset-cleanup?job=retention", secret: "ASSET_CLEANUP_SECRET" },
  { schedule: "0 9 * * *", path: "/api/cron/onboarding", secret: "CRON_SECRET" },
  { schedule: "0 9 * * 1", path: "/api/cron/reengagement", secret: "CRON_SECRET" },
  { schedule: "0 11 * * *", path: "/api/cron/feature-announcements", secret: "CRON_SECRET" },
  { schedule: "0 10 * * *", path: "/api/cron/review-drip", secret: "CRON_SECRET" },
  { schedule: "0 10 * * *", path: "/api/cron/review-prompts", secret: "CRON_SECRET" },
  { schedule: "0 6 * * *", path: "/api/cron/subscription-reminder", secret: "CRON_SECRET" },
  { schedule: "*/15 * * * *", path: "/api/cron/stale-clip-sweep", secret: "CRON_SECRET" },
  { schedule: "*/2 * * * *", path: "/api/cron/dub-sweep", secret: "CRON_SECRET" },
  { schedule: "*/2 * * * *", path: "/api/cron/submagic-sweep", secret: "CRON_SECRET" },
  { schedule: "*/10 * * * *", path: "/api/cron/clip-publish", secret: "CRON_SECRET" },
];

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];

/** Does one cron field ("*", "*\/15", "3", "1-5", "0,30") match `value`? */
function fieldMatches(field: string, value: number, [min, max]: [number, number], isDow: boolean): boolean {
  return field.split(",").some((part) => {
    let step = 1;
    let range = part;
    if (part.includes("/")) {
      const [r, s] = part.split("/");
      range = r;
      step = Number(s);
    }
    let lo: number;
    let hi: number;
    if (range === "*") [lo, hi] = [min, max];
    else if (range.includes("-")) [lo, hi] = range.split("-").map(Number) as [number, number];
    else lo = hi = Number(range);
    const hit = (v: number) => v >= lo && v <= hi && (v - lo) % step === 0;
    // Day-of-week: Sunday is 0 or 7.
    return hit(value) || (isDow && value === 0 && hit(7));
  });
}

/** Is `schedule` due at this minute (UTC)? */
export function isDue(schedule: string, at: Date): boolean {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const values = [at.getUTCMinutes(), at.getUTCHours(), at.getUTCDate(), at.getUTCMonth() + 1, at.getUTCDay()];
  return fields.every((f, i) => fieldMatches(f, values[i], RANGES[i], i === 4));
}
