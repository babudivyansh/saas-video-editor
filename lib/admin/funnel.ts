// Admin → Analytics: the activation funnel, retention by signup week, and
// where things fail. Server-side tables only, so the counts are the real
// ones, not a browser-analytics sample.
//
// Funnel steps are "did this signup ever reach step X" (lifetime), counted
// for signups in the window, so each bar is a subset of the one before it in
// practice (a user can, rarely, pay without running AutoClip — the bars show
// the true counts, not forced nesting).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTOCLIP, RUN_READY_STATUSES } from "@/lib/admin/staff-digest";

export const FUNNEL_RANGES = [7, 30, 90] as const;
export type FunnelRange = (typeof FUNNEL_RANGES)[number];

export interface FunnelStep {
  key:
    | "signed_up" | "uploaded" | "ran_autoclip" | "got_clips" | "downloaded"
    | "saw_upgrade" | "opened_plans" | "started_checkout" | "trial" | "paid";
  label: string;
  users: number;
  /** Set when the step's data only exists from a recent date. */
  note?: string;
}

export interface RetentionRow {
  /** ISO date (Monday) of the signup week. */
  week: string;
  signups: number;
  /** Share of the cohort active again N+ days after signing up; null until the cohort is old enough. */
  d1: number | null;
  d7: number | null;
  d30: number | null;
}

export interface FailureRow {
  label: string;
  total: number;
  failed: number;
  /** Most common failure reason, if any. */
  topReason: string | null;
}

/** One upgrade offer's numbers over the window (UserEvent rows). */
export interface PlacementRow {
  placement: string;
  /** Distinct users who saw / clicked it. */
  shown: number;
  clicked: number;
  /** Distinct users who opened plans or started checkout from it. */
  plansViewed: number;
  checkoutStarted: number;
  checkoutFailed: number;
  checkoutDismissed: number;
}

export interface EmailEngagementRow {
  template: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

export interface FunnelReport {
  days: FunnelRange;
  steps: FunnelStep[];
  medianHoursToFirstRun: number | null;
  retention: RetentionRow[];
  autoClipFailures: { reason: string; count: number }[];
  toolFailures: FailureRow[];
  /** Paywall funnel by placement (events recorded from 26 Nov 2026). */
  placements: PlacementRow[];
  /** Most common Razorpay failure reasons. */
  checkoutFailures: { reason: string; count: number }[];
  /** Trials started in the window, and how many of those were later charged. */
  trialToPaid: { trials: number; paid: number };
  /** Onboarding and upgrade emails: are they arriving and being opened? */
  emailEngagement: EmailEngagementRow[];
  /** Delivery webhooks received in the window, all providers. 0 means the
   *  provider dashboards aren't sending them, so "delivered" can't be known. */
  deliveryWebhooks: number;
}

/** The onboarding and upgrade emails the funnel cares about. */
const FUNNEL_TEMPLATES = [
  "welcome", "first-run-nudge", "onboarding-day-1", "onboarding-day-3", "onboarding-day-7",
  "first-video-success", "low-minutes", "minutes-expiring",
];

const DAY = 86_400_000;

export async function getFunnelReport(days: FunnelRange, now: Date = new Date()): Promise<FunnelReport> {
  const since = new Date(now.getTime() - days * DAY);
  const ready = Prisma.join(RUN_READY_STATUSES);

  const templates = Prisma.join(FUNNEL_TEMPLATES);
  const [
    funnelRows, medianRows, retentionRows, runFailures, toolRows,
    placementRows, failureRows, trialRows, emailRows, webhookCount,
  ] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        COUNT(*) AS signed_up,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Asset" a WHERE a."userId" = u.id AND a."sourceFeature" IN ('upload', 'url-import'))
                            OR EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP})) AS uploaded,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP})) AS ran_autoclip,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP} AND p.status IN (${ready}))) AS got_clips,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserEvent" e WHERE e."userId" = u.id AND e.type = 'download')) AS downloaded,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserEvent" e WHERE e."userId" = u.id AND e.type = 'upgrade_prompt')) AS saw_upgrade,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserEvent" e WHERE e."userId" = u.id AND e.type = 'plans_viewed')) AS opened_plans,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserEvent" e WHERE e."userId" = u.id AND e.type = 'checkout')) AS started_checkout,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "SubscriptionEvent" s WHERE s."userId" = u.id AND s.type = 'trial_started')) AS trial,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Purchase" pu WHERE pu."userId" = u.id AND pu."amountInPaise" > 0)) AS paid
      FROM "User" u
      WHERE u."createdAt" >= ${since} AND u."createdAt" < ${now} AND u.role = 'USER' AND u."purgedAt" IS NULL`,
    prisma.$queryRaw<Array<{ hours: number | null }>>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (f.first_run - u."createdAt")) / 3600) AS hours
      FROM "User" u
      JOIN (SELECT p."userId", MIN(p."createdAt") AS first_run FROM "Project" p WHERE p."productType" = ${AUTOCLIP} GROUP BY p."userId") f
        ON f."userId" = u.id
      WHERE u."createdAt" >= ${since} AND u."createdAt" < ${now} AND u.role = 'USER' AND u."purgedAt" IS NULL`,
    // "Active again" = any login, upload, AutoClip run or AI tool use at least
    // N days after signup. Logins alone undercount: a session cookie lasts
    // weeks, so a returning user often never logs in again.
    prisma.$queryRaw<Array<{ week: Date; signups: bigint; d1: bigint; d7: bigint; d30: bigint }>>`
      WITH cohort AS (
        SELECT u.id, u."createdAt" AS joined
        FROM "User" u
        WHERE u."createdAt" >= ${new Date(now.getTime() - 12 * 7 * DAY)} AND u."createdAt" < ${now}
          AND u.role = 'USER' AND u."purgedAt" IS NULL
      ),
      activity AS (
        SELECT "userId", "createdAt" AS at FROM "LoginEvent" WHERE "userId" IN (SELECT id FROM cohort)
        UNION ALL SELECT "userId", "createdAt" FROM "Asset" WHERE "userId" IN (SELECT id FROM cohort)
        UNION ALL SELECT "userId", "createdAt" FROM "Project" WHERE "userId" IN (SELECT id FROM cohort)
        UNION ALL SELECT "userId", "createdAt" FROM "Generation" WHERE "userId" IN (SELECT id FROM cohort)
      ),
      last_seen AS (
        SELECT c.id, c.joined, MAX(a.at) AS last_at
        FROM cohort c LEFT JOIN activity a ON a."userId" = c.id
        GROUP BY c.id, c.joined
      )
      SELECT date_trunc('week', joined) AS week,
             COUNT(*) AS signups,
             COUNT(*) FILTER (WHERE last_at >= joined + interval '1 day') AS d1,
             COUNT(*) FILTER (WHERE last_at >= joined + interval '7 days') AS d7,
             COUNT(*) FILTER (WHERE last_at >= joined + interval '30 days') AS d30
      FROM last_seen
      GROUP BY 1 ORDER BY 1 DESC`,
    prisma.project.groupBy({
      by: ["failureReason"],
      where: { productType: AUTOCLIP, status: "failed", updatedAt: { gte: since, lt: now } },
      _count: { _all: true },
      orderBy: { _count: { failureReason: "desc" } },
      take: 8,
    }),
    prisma.$queryRaw<Array<{ label: string; total: bigint; failed: bigint; top_reason: string | null }>>`
      SELECT g."toolSlug" || COALESCE(' · ' || g."modelId", '') AS label,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE g.status IN ('failed', 'refunded')) AS failed,
             MODE() WITHIN GROUP (ORDER BY LEFT(g."errorMessage", 120)) FILTER (WHERE g.status IN ('failed', 'refunded')) AS top_reason
      FROM "Generation" g
      WHERE g."createdAt" >= ${since} AND g."createdAt" < ${now}
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE g.status IN ('failed', 'refunded')) > 0
      ORDER BY 3 DESC
      LIMIT 10`,
    prisma.$queryRaw<Array<{ placement: string | null; shown: bigint; clicked: bigint; plans: bigint; started: bigint; failed: bigint; dismissed: bigint }>>`
      SELECT e.meta->>'placement' AS placement,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'upgrade_prompt' AND e.meta->>'action' = 'shown') AS shown,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'upgrade_prompt' AND e.meta->>'action' = 'clicked') AS clicked,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'plans_viewed') AS plans,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'checkout' AND e.meta->>'stage' = 'started') AS started,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'checkout' AND e.meta->>'stage' = 'failed') AS failed,
             COUNT(DISTINCT e."userId") FILTER (WHERE e.type = 'checkout' AND e.meta->>'stage' = 'dismissed') AS dismissed
      FROM "UserEvent" e
      WHERE e.type IN ('upgrade_prompt', 'plans_viewed', 'checkout') AND e."createdAt" >= ${since} AND e."createdAt" < ${now}
      GROUP BY 1
      ORDER BY 2 DESC, 5 DESC`,
    prisma.$queryRaw<Array<{ reason: string | null; count: bigint }>>`
      SELECT COALESCE(e.meta->>'reason', 'No reason given') AS reason, COUNT(*) AS count
      FROM "UserEvent" e
      WHERE e.type = 'checkout' AND e.meta->>'stage' = 'failed' AND e."createdAt" >= ${since} AND e."createdAt" < ${now}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 6`,
    prisma.$queryRaw<Array<{ trials: bigint; paid: bigint }>>`
      SELECT COUNT(DISTINCT s."userId") AS trials,
             COUNT(DISTINCT s."userId") FILTER (WHERE EXISTS (
               SELECT 1 FROM "SubscriptionEvent" c WHERE c."userId" = s."userId" AND c.type = 'charged' AND c."createdAt" > s."createdAt")) AS paid
      FROM "SubscriptionEvent" s
      WHERE s.type = 'trial_started' AND s."createdAt" >= ${since} AND s."createdAt" < ${now}`,
    prisma.$queryRaw<Array<{ template: string; sent: bigint; delivered: bigint; opened: bigint; clicked: bigint }>>`
      SELECT m."templateId" AS template,
             COUNT(*) AS sent,
             COUNT(m."deliveredAt") AS delivered,
             COUNT(m."openedAt") AS opened,
             COUNT(m."clickedAt") AS clicked
      FROM "EmailMessage" m
      WHERE m."templateId" IN (${templates}) AND m."createdAt" >= ${since} AND m."createdAt" < ${now}
        AND m."providerMessageId" IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC`,
    prisma.emailWebhookEvent.count({ where: { receivedAt: { gte: since, lt: now } } }),
  ]);

  const f = funnelRows[0] ?? {};
  const n = (k: string) => Number(f[k] ?? 0);
  // A step is "mature" only once N days have passed since the cohort's week ended.
  const share = (count: bigint, signups: bigint, week: Date, afterDays: number) =>
    week.getTime() + 7 * DAY + afterDays * DAY > now.getTime() || Number(signups) === 0
      ? null
      : Math.round((Number(count) / Number(signups)) * 1000) / 10;

  return {
    days,
    steps: [
      { key: "signed_up", label: "Signed up", users: n("signed_up") },
      { key: "uploaded", label: "Uploaded or imported a video", users: n("uploaded") },
      { key: "ran_autoclip", label: "Started an AutoClip run", users: n("ran_autoclip") },
      { key: "got_clips", label: "Got clips back", users: n("got_clips") },
      { key: "downloaded", label: "Downloaded a file", users: n("downloaded"), note: "Recorded from 19 Nov 2026" },
      { key: "saw_upgrade", label: "Saw an upgrade offer", users: n("saw_upgrade"), note: "Recorded from 26 Nov 2026" },
      { key: "opened_plans", label: "Opened the plans", users: n("opened_plans"), note: "Recorded from 26 Nov 2026" },
      { key: "started_checkout", label: "Started a checkout", users: n("started_checkout"), note: "Recorded from 26 Nov 2026" },
      { key: "trial", label: "Started a Pro trial", users: n("trial") },
      { key: "paid", label: "Paid", users: n("paid") },
    ],
    medianHoursToFirstRun: medianRows[0]?.hours == null ? null : Math.round(Number(medianRows[0].hours) * 10) / 10,
    retention: retentionRows.map((r) => ({
      week: r.week.toISOString().slice(0, 10),
      signups: Number(r.signups),
      d1: share(r.d1, r.signups, r.week, 1),
      d7: share(r.d7, r.signups, r.week, 7),
      d30: share(r.d30, r.signups, r.week, 30),
    })),
    autoClipFailures: runFailures.map((r) => ({ reason: r.failureReason ?? "No reason recorded", count: r._count._all })),
    toolFailures: toolRows.map((r) => ({ label: r.label, total: Number(r.total), failed: Number(r.failed), topReason: r.top_reason })),
    placements: placementRows.map((r) => ({
      placement: r.placement ?? "other",
      shown: Number(r.shown),
      clicked: Number(r.clicked),
      plansViewed: Number(r.plans),
      checkoutStarted: Number(r.started),
      checkoutFailed: Number(r.failed),
      checkoutDismissed: Number(r.dismissed),
    })),
    checkoutFailures: failureRows.map((r) => ({ reason: r.reason ?? "No reason given", count: Number(r.count) })),
    trialToPaid: { trials: Number(trialRows[0]?.trials ?? 0), paid: Number(trialRows[0]?.paid ?? 0) },
    emailEngagement: emailRows.map((r) => ({
      template: r.template,
      sent: Number(r.sent),
      delivered: Number(r.delivered),
      opened: Number(r.opened),
      clicked: Number(r.clicked),
    })),
    deliveryWebhooks: webhookCount,
  };
}
