import { CRON_SCHEDULE, isDue } from "@/lib/cron-schedule";
import { KNOWN_CRON_JOBS, type CronRunId } from "@/lib/cron-tracking";

// What each scheduled job IS, for the admin Scheduled jobs tab: a label, one
// line on what it does (condensed from ops/crontab), and a safety tier.
//
//   safe   — idempotent housekeeping; running it early changes nothing a user
//            notices. One confirm click.
//   danger — moves money or credits, deletes data, emails users, or is heavy on
//            the database. The admin must type the job id to run it, and the
//            server re-checks that phrase.

export type CronTier = "safe" | "danger";

export interface CronJobInfo {
  label: string;
  description: string;
  tier: CronTier;
}

export const CRON_CATALOG: Record<string, CronJobInfo> = {
  "/api/cron/refill-credits": {
    label: "Credit refill + subscription expiry",
    description: "Grants monthly credits to users whose refill is due and expires lapsed subscriptions.",
    tier: "danger",
  },
  "/api/cron/social-refresh": {
    label: "Social: snapshot refresh",
    description: "Refreshes current follower and post numbers for connected social accounts.",
    tier: "safe",
  },
  "/api/cron/social-refresh?job=retention": {
    label: "Social: retention check",
    description: "Weekly clean-up of old social snapshot data past its retention window.",
    tier: "danger",
  },
  "/api/cron/social-refresh?job=digest": {
    label: "Social: weekly digest email",
    description: "Emails every Social Tracker user their weekly digest.",
    tier: "danger",
  },
  "/api/cron/social-refresh?job=daily-metrics": {
    label: "Social: daily metrics",
    description: "Fills gaps in the per-day metric history.",
    tier: "safe",
  },
  "/api/cron/social-refresh?job=scores": {
    label: "Social: scores",
    description: "Recomputes viral/AI post scores and account health. The first run back-fills everything; run off-peak.",
    tier: "danger",
  },
  "/api/cron/social-refresh?job=goals": {
    label: "Social: goals",
    description: "Marks reached goals as hit and lapsed ones as missed.",
    tier: "safe",
  },
  "/api/cron/social-refresh?job=reports": {
    label: "Social: scheduled reports",
    description: "Queues scheduled report runs that are due (reports are emailed).",
    tier: "danger",
  },
  "/api/cron/social-refresh?job=recalibrate-virality": {
    label: "AutoClip: recalibrate virality",
    description: "Recomputes virality-score weights from real engagement. No-op unless calibration is enabled.",
    tier: "safe",
  },
  "/api/cron/commission-payout": {
    label: "Affiliate commission payouts",
    description: "Notifies payouts for commissions whose 30-day hold has elapsed.",
    tier: "danger",
  },
  "/api/cron/admin-digest": {
    label: "Admin weekly digest",
    description: "Emails the admins the weekly ops digest.",
    tier: "safe",
  },
  "/api/cron/mrr-snapshot": {
    label: "MRR snapshot",
    description: "Records today's MRR. The only source of MRR history; safe to re-run (upserts the day).",
    tier: "safe",
  },
  "/api/cron/account-purge": {
    label: "Account purge",
    description: "Permanently deletes accounts whose 30-day deactivation window has passed.",
    tier: "danger",
  },
  "/api/cron/asset-cleanup": {
    label: "Asset cleanup: orphans",
    description: "Removes orphaned S3 uploads that never became an asset.",
    tier: "safe",
  },
  "/api/cron/asset-cleanup?job=retention": {
    label: "Asset cleanup: archive retention",
    description: "Permanently deletes archived assets past their retention period (S3 + database).",
    tier: "danger",
  },
  "/api/cron/onboarding": {
    label: "Onboarding emails",
    description: "Sends the day 1 / 3 / 7 onboarding email sequence.",
    tier: "danger",
  },
  "/api/cron/reengagement": {
    label: "Re-engagement emails",
    description: "Sends 7/30-day win-back emails and the unused-credits nudge.",
    tier: "danger",
  },
  "/api/cron/feature-announcements": {
    label: "Feature announcements",
    description: "Emails any published, unsent feature announcement to all active users.",
    tier: "danger",
  },
  "/api/cron/review-drip": {
    label: "Review request drip",
    description: "Sends review-request emails (up to 3 per user).",
    tier: "danger",
  },
  "/api/cron/review-prompts": {
    label: "Review prompts",
    description: "Sends calendar-driven review prompts (in-app + email).",
    tier: "danger",
  },
  "/api/cron/subscription-reminder": {
    label: "Subscription expiry reminders",
    description: "Emails 7d/3d/1d expiry warnings and the expired notice.",
    tier: "danger",
  },
  "/api/cron/stale-clip-sweep": {
    label: "Stale AutoClip sweep",
    description: "Fails and refunds clips stranded in queued/rendering by a crash.",
    tier: "safe",
  },
  "/api/cron/dub-sweep": {
    label: "Dub sweep",
    description: "Finishes ElevenLabs dubbing jobs (the main completion path until webhooks are live).",
    tier: "safe",
  },
  "/api/cron/submagic-sweep": {
    label: "Caption render sweep",
    description: "Reconciles Submagic caption renders, including paid ones that failed inconclusively.",
    tier: "safe",
  },
  "/api/cron/clip-publish": {
    label: "Scheduled clip publishing",
    description: "Publishes clips whose scheduled time has arrived.",
    tier: "safe",
  },
};

/** The tracking id a path records under: "mrr-snapshot", "social-refresh:scores". */
export function runIdForPath(path: string): CronRunId {
  const url = new URL(path, "http://x");
  const name = url.pathname.replace(/^\/api\/cron\//, "");
  const jobs = (KNOWN_CRON_JOBS as Record<string, readonly string[]>)[name];
  if (!jobs) return name as CronRunId;
  return `${name}:${url.searchParams.get("job") ?? jobs[0]}` as CronRunId;
}

/** What the admin must type to run a job, or null for a one-click job. */
export function confirmPhraseFor(path: string): string | null {
  return CRON_CATALOG[path]?.tier === "danger" ? runIdForPath(path) : null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: string) => n.padStart(2, "0");

/** Plain-words schedule for the patterns ops/crontab uses; raw expression otherwise. */
export function describeSchedule(schedule: string): string {
  const [min, hour, dom, mon, dow] = schedule.trim().split(/\s+/);
  const step = /^\*\/(\d+)$/.exec(min);
  if (step && hour === "*" && dom === "*" && mon === "*" && dow === "*") return `Every ${step[1]} min`;
  if (/^\d+$/.test(min) && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return min === "0" ? "Hourly" : `Hourly at :${pad(min)}`;
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === "*" && mon === "*") {
    const time = `${pad(hour)}:${pad(min)} UTC`;
    if (dow === "*") return `Daily ${time}`;
    if (/^\d$/.test(dow)) return `${DAYS[Number(dow)]} ${time}`;
  }
  return schedule;
}

/** The next minute (strictly after `from`) the schedule is due, within 8 days. */
export function nextDue(schedule: string, from: Date): Date | null {
  const start = Math.floor(from.getTime() / 60_000) * 60_000 + 60_000;
  for (let i = 0; i < 8 * 24 * 60; i++) {
    const at = new Date(start + i * 60_000);
    if (isDue(schedule, at)) return at;
  }
  return null;
}

export { CRON_SCHEDULE };
