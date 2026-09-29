import { CRON_CATALOG, CRON_SCHEDULE, confirmPhraseFor, describeSchedule, nextDue, runIdForPath, type CronTier } from "@/lib/cron-catalog";
import { getCronPauses, getManualRuns, type CronManualRun, type CronPause } from "@/lib/cron-dispatch";
import { getCronRunStatuses, type CronRunStatus } from "@/lib/cron-tracking";
import { env } from "@/lib/env";

// One row per scheduled job for the admin Scheduled jobs tab: what it is, when
// it runs, how it last went, and whether it's paused.

export interface CronJobRow {
  path: string;
  runId: string;
  label: string;
  description: string;
  tier: CronTier;
  /** What to type to run it; null for a one-click job. */
  confirmPhrase: string | null;
  schedule: string;
  scheduleText: string;
  nextDueAt: string | null;
  /** Which env var the route authenticates with, and whether it's set. */
  secretEnv: string;
  secretConfigured: boolean;
  paused: CronPause | null;
  lastManual: CronManualRun | null;
  status: CronRunStatus | null;
}

export async function getCronJobRows(now = new Date()): Promise<CronJobRow[]> {
  const [statuses, pauses, manual] = await Promise.all([getCronRunStatuses(), getCronPauses(), getManualRuns()]);
  const byId = new Map(statuses.map((s) => [s.name as string, s]));
  return CRON_SCHEDULE.map((e) => {
    const info = CRON_CATALOG[e.path];
    const runId = runIdForPath(e.path);
    return {
      path: e.path,
      runId,
      label: info?.label ?? runId,
      description: info?.description ?? "",
      tier: info?.tier ?? "danger",
      confirmPhrase: confirmPhraseFor(e.path),
      schedule: e.schedule,
      scheduleText: describeSchedule(e.schedule),
      nextDueAt: nextDue(e.schedule, now)?.toISOString() ?? null,
      secretEnv: e.secret,
      secretConfigured: !!env[e.secret],
      paused: pauses.get(e.path) ?? null,
      lastManual: manual.get(e.path) ?? null,
      status: byId.get(runId) ?? null,
    };
  });
}
