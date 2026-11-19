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
  key: "signed_up" | "uploaded" | "ran_autoclip" | "got_clips" | "downloaded" | "trial" | "paid";
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

export interface FunnelReport {
  days: FunnelRange;
  steps: FunnelStep[];
  medianHoursToFirstRun: number | null;
  retention: RetentionRow[];
  autoClipFailures: { reason: string; count: number }[];
  toolFailures: FailureRow[];
}

const DAY = 86_400_000;

export async function getFunnelReport(days: FunnelRange, now: Date = new Date()): Promise<FunnelReport> {
  const since = new Date(now.getTime() - days * DAY);
  const ready = Prisma.join(RUN_READY_STATUSES);

  const [funnelRows, medianRows, retentionRows, runFailures, toolRows] = await Promise.all([
    prisma.$queryRaw<Array<Record<string, bigint>>>`
      SELECT
        COUNT(*) AS signed_up,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Asset" a WHERE a."userId" = u.id AND a."sourceFeature" IN ('upload', 'url-import'))
                            OR EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP})) AS uploaded,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP})) AS ran_autoclip,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Project" p WHERE p."userId" = u.id AND p."productType" = ${AUTOCLIP} AND p.status IN (${ready}))) AS got_clips,
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "UserEvent" e WHERE e."userId" = u.id AND e.type = 'download')) AS downloaded,
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
  };
}
