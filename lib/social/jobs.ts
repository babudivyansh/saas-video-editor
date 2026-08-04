// The nightly jobs the schema was designed around.
//
// Three of the four columns these write (viralScore, aiScore, healthScore) are
// PERSISTED rather than computed per request, because the viral-score cohort is
// the trailing 90 days of the same media type — expensive to rebuild on every
// page load, and non-reproducible as the cohort shifts under it. The *At columns
// exist so staleness is visible rather than silent.
//
// Every job here is bounded and resumable: it takes a slice, records what it
// did, and returns counts. A cron that can only succeed by processing every row
// in one invocation is a cron that stops working the month you get busy.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  accountHealth,
  goalProgress,
  newlyHitGoals,
  newlyMissedGoals,
  postingConsistency,
  postScoreComponents,
  rangeBounds,
  viralCohort,
  viralScore,
  type Goal,
  type PostRow,
} from "./metrics";
import { loadAccountKpis, loadAccounts, loadFollowerSeries, loadSeries } from "./queries";
import { invalidateAccount } from "./cache";
import type { MetricKey } from "./capabilities";
import { syncAccount } from "./service";

/** How many accounts one cron invocation will touch. Bounded on purpose. */
const ACCOUNT_BATCH = 50;
/** Posts rescored per account per night — newest first. */
const POSTS_PER_ACCOUNT = 200;
/** History the cohort is drawn from. Matches lib/social/metrics/scores.ts. */
const COHORT_DAYS = 90;
const HEALTH_WINDOW_DAYS = 30;
const GOAL_WINDOW_DAYS = 90;

const POST_SELECT = {
  id: true, caption: true, mediaType: true, publishedAt: true, views: true, likes: true,
  comments: true, shares: true, saves: true, reach: true, impressions: true,
  watchTimeSec: true, avgWatchTimeSec: true, avgViewPercentage: true, ctr: true,
} as const;

export interface DailyMetricsResult {
  considered: number;
  synced: number;
  failed: number;
}

/**
 * Pull provider-reported days for accounts whose daily series has fallen behind.
 *
 * Separate from the six-hourly `refresh` job because the two answer different
 * questions: refresh keeps the CURRENT numbers current, this keeps the HISTORY
 * complete. An account that is refreshed constantly can still have holes in its
 * daily series if a provider call failed on the day it mattered.
 *
 * `lastDailyMetricDate` never advances past the newest day actually received —
 * today is always partial — so an account is due whenever that date is older
 * than yesterday.
 */
export async function syncDailyMetrics(now = new Date()): Promise<DailyMetricsResult> {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

  const due = await prisma.socialAccount.findMany({
    where: {
      status: "active",
      OR: [{ lastDailyMetricDate: null }, { lastDailyMetricDate: { lt: yesterday } }],
    },
    orderBy: { lastDailyMetricDate: { sort: "asc", nulls: "first" } },
    take: ACCOUNT_BATCH,
  });

  let synced = 0;
  let failed = 0;
  for (const account of due) {
    try {
      await syncAccount(account);
      synced += 1;
    } catch (e) {
      // One dead account must not stop the batch — that is how a single revoked
      // token silently freezes everyone else's history.
      failed += 1;
      logger.warn("social-jobs", `daily-metrics sync failed for ${account.id}`, e);
    }
  }

  return { considered: due.length, synced, failed };
}

export interface ScoresResult {
  accounts: number;
  postsScored: number;
  healthScored: number;
}

/**
 * Recompute post scores and account health.
 *
 * A post whose cohort is too small to rank is written back as NULL, not as 0.
 * Zero is a score; "we cannot rank this yet" is not, and conflating them is
 * how a new account's entire library reads as worthless.
 */
export async function recomputeScores(now = new Date()): Promise<ScoresResult> {
  const accounts = await prisma.socialAccount.findMany({
    where: { status: "active" },
    orderBy: { healthScoreAt: { sort: "asc", nulls: "first" } },
    take: ACCOUNT_BATCH,
    select: { id: true, userId: true },
  });

  let postsScored = 0;
  let healthScored = 0;

  for (const { id: accountId, userId } of accounts) {
    try {
      const history = await prisma.socialPost.findMany({
        where: { accountId, publishedAt: { gte: new Date(now.getTime() - COHORT_DAYS * 86_400_000) } },
        orderBy: { publishedAt: "desc" },
        take: POSTS_PER_ACCOUNT * 2,
        select: POST_SELECT,
      });

      const recent = history.slice(0, POSTS_PER_ACCOUNT);
      for (const post of recent) {
        const cohort = viralCohort(post as PostRow, history as PostRow[], now);
        const components = postScoreComponents(post as PostRow, cohort);
        await prisma.socialPost.update({
          where: { id: post.id },
          data: {
            viralScore: viralScore(post as PostRow, cohort),
            viralScoreAt: now,
            aiScore: components?.score ?? null,
            scoredAt: now,
          },
        });
        postsScored += 1;
      }

      const health = await computeAccountHealth(userId, accountId, history as PostRow[], now);
      await prisma.socialAccount.update({
        where: { id: accountId },
        data: { healthScore: health, healthScoreAt: now },
      });
      healthScored += 1;

      // The dashboard reads healthScore straight off the account row, so a
      // rescore that leaves a stale cache is a rescore nobody sees.
      await invalidateAccount(accountId, userId);
    } catch (e) {
      logger.warn("social-jobs", `scoring failed for ${accountId}`, e);
    }
  }

  return { accounts: accounts.length, postsScored, healthScored };
}

async function computeAccountHealth(
  userId: string,
  accountId: string,
  history: PostRow[],
  now: Date,
): Promise<number | null> {
  const [context] = await loadAccounts(userId, [accountId]);
  if (!context) return null;

  const { from, to } = rangeBounds(HEALTH_WINDOW_DAYS, now);
  const { kpis, completeness } = await loadAccountKpis(context, from, to, context.timezone ?? "UTC");

  const health = accountHealth({
    growthRatePct: kpis.followerGrowthRate.current,
    engagementRate: kpis.engagementRate.current,
    baselineEngagementRate: kpis.engagementRate.previous,
    consistencyScore: postingConsistency(history, now).score,
    retentionPct: kpis.avgViewPercentage.current,
    dataCompleteness: completeness,
  });

  // Confidence of zero means not one component had data. Writing 0 there would
  // publish "this account is in terrible health" as a fact about our own
  // missing data.
  return health.confidence > 0 ? health.score : null;
}

export interface GoalsResult {
  evaluated: number;
  hit: number;
  missed: number;
}

/**
 * Flip goals to hit or missed.
 *
 * Terminal states are recorded rather than derived on read: "you hit 10k on the
 * 3rd" has to survive the follower count dropping back to 9,980 on the 4th,
 * which a live comparison against the current value cannot do.
 */
export async function evaluateGoals(now = new Date()): Promise<GoalsResult> {
  const active = await prisma.socialGoal.findMany({ where: { status: "active" } });
  if (active.length === 0) return { evaluated: 0, hit: 0, missed: 0 };

  const { from, to } = rangeBounds(GOAL_WINDOW_DAYS, now);
  const byUser = new Map<string, typeof active>();
  for (const goal of active) {
    const bucket = byUser.get(goal.userId);
    if (bucket) bucket.push(goal);
    else byUser.set(goal.userId, [goal]);
  }

  let hit = 0;
  let missed = 0;

  for (const [userId, goals] of byUser) {
    try {
      const accounts = await loadAccounts(userId);
      const progress = [];
      const pure: Goal[] = [];

      for (const goal of goals) {
        const series = await goalSeries(goal, accounts, from, to);
        const asGoal: Goal = {
          id: goal.id,
          metric: goal.metric,
          target: goal.target,
          baseline: goal.baseline,
          startAt: goal.startAt,
          dueAt: goal.dueAt,
          status: goal.status,
        };
        pure.push(asGoal);
        progress.push(goalProgress(asGoal, series, now));
      }

      for (const { goal } of newlyHitGoals(progress, pure)) {
        await prisma.socialGoal.update({
          where: { id: goal.id },
          data: { status: "hit", hitAt: now },
        });
        hit += 1;
      }
      for (const { goal } of newlyMissedGoals(progress, pure)) {
        await prisma.socialGoal.update({ where: { id: goal.id }, data: { status: "missed" } });
        missed += 1;
      }
    } catch (e) {
      logger.warn("social-jobs", `goal evaluation failed for user ${userId}`, e);
    }
  }

  return { evaluated: active.length, hit, missed };
}

/** Same scoping rule as the goals route: one account, or the whole portfolio. */
async function goalSeries(
  goal: { accountId: string | null; metric: string },
  accounts: Awaited<ReturnType<typeof loadAccounts>>,
  from: Date,
  to: Date,
) {
  const scoped = goal.accountId ? accounts.filter((a) => a.id === goal.accountId) : accounts;
  if (scoped.length === 0) return [];

  const perAccount = await Promise.all(
    scoped.map(async (account) => {
      const tz = account.timezone ?? "UTC";
      if (goal.metric === "followers") return loadFollowerSeries(account.id, from, to, tz);
      return (await loadSeries(account, goal.metric as MetricKey, from, to, "day", tz)).points;
    }),
  );
  if (perAccount.length === 1) return perAccount[0];

  const byDate = new Map<string, number>();
  for (const points of perAccount) {
    for (const p of points) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
