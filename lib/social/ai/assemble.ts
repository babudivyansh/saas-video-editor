// The bridge: database rows in, factsheets out.
//
// This is the ONLY impure module under lib/social/ai. The generators take a
// factsheet and cannot reach past it, which means every query that feeds a
// prompt is in this one file and can be reviewed in one sitting. Nothing here
// decides anything — it loads rows, hands them to the pure engine, and hands the
// engine's output to the pure builders.

import { prisma } from "@/lib/prisma";
import type { MetricKey } from "../capabilities";
import {
  accountHealth,
  benchmark,
  computeAlerts,
  computeBestTimes,
  contentTypeBreakdown,
  postAudience,
  postEngagementRate,
  postScoreComponents,
  postingConsistency,
  rankByAudience,
  rankedTimeSlots,
  viralCohort,
  type PostRow,
  type Period,
  type TimeZone,
} from "../metrics";
import { loadAccountKpis, type AccountContext } from "../queries";
import {
  buildAccountFactsheet,
  buildContentFactsheet,
  buildKpiFactsheet,
  buildPostBatchFactsheet,
  buildScheduleFactsheet,
  type Factsheet,
  type TopPostFact,
} from "./factsheets";
import type { KpiExplainInput } from "./kpi-explain";

/** Posts we will look at for scoring context. A year is plenty and bounded. */
const COHORT_DAYS = 365;
const COHORT_LIMIT = 500;
const TOP_POSTS_IN_SUMMARY = 3;
const POSTS_IN_CONTENT_SHEET = 20;

export interface Window {
  from: Date;
  to: Date;
  tz: TimeZone;
}

const POST_SELECT = {
  id: true, caption: true, thumbnailUrl: true, permalink: true, mediaType: true,
  publishedAt: true, views: true, likes: true, comments: true, shares: true,
  saves: true, reach: true, impressions: true, watchTimeSec: true,
  avgWatchTimeSec: true, avgViewPercentage: true, ctr: true,
} as const;

/** Posts published in a window, newest first. */
async function loadPosts(accountId: string, from: Date, to: Date): Promise<PostRow[]> {
  return prisma.socialPost.findMany({
    where: { accountId, publishedAt: { gte: from, lt: to } },
    orderBy: { publishedAt: "desc" },
    take: COHORT_LIMIT,
    select: POST_SELECT,
  });
}

/** The trailing history a post's percentiles are measured against. */
async function loadCohortHistory(accountId: string, now: Date): Promise<PostRow[]> {
  return prisma.socialPost.findMany({
    where: { accountId, publishedAt: { gte: new Date(now.getTime() - COHORT_DAYS * 86_400_000) } },
    orderBy: { publishedAt: "desc" },
    take: COHORT_LIMIT,
    select: POST_SELECT,
  });
}

/** A post plus the score the engine computed for it, ready for a factsheet. */
function toFact(post: PostRow, history: PostRow[], now: Date): TopPostFact {
  const cohort = viralCohort(post, history, now);
  return {
    id: post.id,
    caption: post.caption,
    mediaType: post.mediaType,
    publishedAt: post.publishedAt,
    audience: postAudience(post),
    audienceLabel: post.views != null ? "views" : "reach",
    engagementRate: postEngagementRate(post),
    score: postScoreComponents(post, cohort),
  };
}

export interface AccountFactsheetResult {
  facts: Factsheet;
  /** Surfaced so a route can refuse to charge for a summary of nothing. */
  postCount: number;
}

/** The factsheet behind executive summaries and caption drafting. */
export async function assembleAccountFactsheet(
  account: AccountContext,
  period: Period,
  window: Window,
  now: Date,
): Promise<AccountFactsheetResult> {
  const [{ kpis, derived, completeness }, posts, history] = await Promise.all([
    loadAccountKpis(account, window.from, window.to, window.tz),
    loadPosts(account.id, window.from, window.to),
    loadCohortHistory(account.id, now),
  ]);

  const snapshots = await prisma.socialAccountSnapshot.findMany({
    where: { accountId: account.id },
    orderBy: { capturedAt: "asc" },
    select: { capturedAt: true, followers: true, views: true, impressions: true, reach: true, engagement: true },
  });

  const engagementRate = kpis.engagementRate.current;
  const consistency = postingConsistency(history, now);
  const health = accountHealth({
    growthRatePct: kpis.followerGrowthRate.current,
    engagementRate,
    baselineEngagementRate: kpis.engagementRate.previous,
    consistencyScore: consistency.score,
    retentionPct: kpis.avgViewPercentage.current,
    dataCompleteness: completeness,
  });

  const facts = buildAccountFactsheet({
    provider: account.provider,
    label: account.displayName ?? account.username,
    period,
    windowStart: window.from,
    windowEnd: window.to,
    kpis,
    derived,
    health: {
      score: health.score,
      confidence: health.confidence,
      components: health.components.map((c) => ({ label: c.label, value: c.value })),
    },
    benchmark: benchmark(engagementRate, account.provider),
    contentMix: contentTypeBreakdown(posts),
    topPosts: rankByAudience(posts)
      .slice(0, TOP_POSTS_IN_SUMMARY)
      .map((p) => toFact(p, history, now)),
    bestSlot: computeBestTimes(history, window.tz).best,
    alerts: computeAlerts(snapshots, history, now),
  });

  return { facts, postCount: posts.length };
}

/** Metrics that plausibly drive another, in preference order. */
const DRIVERS: Partial<Record<MetricKey, MetricKey[]>> = {
  // Deliberately not impressions: where a platform retired it, impressions IS
  // views (see kpis.ts), so it would "explain" every views movement perfectly
  // and tautologically.
  views: ["postsPublished", "reach"],
  reach: ["postsPublished", "followers"],
  impressions: ["postsPublished", "reach"],
  likes: ["reach", "views", "postsPublished"],
  comments: ["reach", "views", "postsPublished"],
  shares: ["reach", "views", "postsPublished"],
  saves: ["reach", "views", "postsPublished"],
  totalInteractions: ["reach", "views", "postsPublished"],
  engagementRate: ["totalInteractions", "reach", "views"],
  followers: ["followersGained", "followersLost"],
  followersGained: ["reach", "postsPublished"],
  profileViews: ["reach", "postsPublished"],
  websiteClicks: ["profileViews", "reach"],
  watchTimeSec: ["views", "avgViewDurationSec"],
};

export interface KpiFactsheetResult {
  facts: Factsheet;
  /** Same numbers, structured — the deterministic template runs off this. */
  input: KpiExplainInput;
}

export async function assembleKpiFactsheet(
  account: AccountContext,
  metric: MetricKey,
  window: Window,
): Promise<KpiFactsheetResult> {
  const { kpis } = await loadAccountKpis(account, window.from, window.to, window.tz);
  const drivers = (DRIVERS[metric] ?? ["postsPublished"]).map((k) => kpis[k]).filter(Boolean);

  return {
    facts: buildKpiFactsheet({
      provider: account.provider,
      metric,
      kpi: kpis[metric],
      windowStart: window.from,
      windowEnd: window.to,
      context: drivers,
    }),
    input: { metric, kpi: kpis[metric], drivers },
  };
}

export interface ContentFactsheetResult {
  facts: Factsheet;
  postIds: string[];
}

/** The factsheet behind content recommendations. */
export async function assembleContentFactsheet(
  account: AccountContext,
  window: Window,
  now: Date,
): Promise<ContentFactsheetResult> {
  const [{ kpis }, posts, history] = await Promise.all([
    loadAccountKpis(account, window.from, window.to, window.tz),
    loadPosts(account.id, window.from, window.to),
    loadCohortHistory(account.id, now),
  ]);

  const ranked = rankByAudience(posts).slice(0, POSTS_IN_CONTENT_SHEET);
  return {
    facts: buildContentFactsheet({
      provider: account.provider,
      windowStart: window.from,
      windowEnd: window.to,
      posts: ranked.map((p) => toFact(p, history, now)),
      contentMix: contentTypeBreakdown(posts),
      bestSlots: rankedTimeSlots(computeBestTimes(history, window.tz)),
      consistency: postingConsistency(history, now),
      kpis,
    }),
    postIds: ranked.map((p) => p.id),
  };
}

/** The factsheet behind one batch of post narrations. */
export async function assemblePostBatchFactsheet(
  account: AccountContext,
  postIds: string[],
  now: Date,
): Promise<ContentFactsheetResult> {
  const [posts, history] = await Promise.all([
    prisma.socialPost.findMany({
      // accountId is part of the filter, not just the ids: without it a caller
      // could narrate someone else's posts by id through their own account.
      where: { id: { in: postIds }, accountId: account.id },
      select: POST_SELECT,
    }),
    loadCohortHistory(account.id, now),
  ]);

  return {
    facts: buildPostBatchFactsheet({
      provider: account.provider,
      posts: posts.map((p) => toFact(p, history, now)),
      cohortSize: history.length,
    }),
    postIds: posts.map((p) => p.id),
  };
}

/** The factsheet behind schedule suggestions. */
export async function assembleScheduleFactsheet(
  account: AccountContext,
  now: Date,
  tz: TimeZone,
): Promise<Factsheet> {
  const history = await loadCohortHistory(account.id, now);
  const times = computeBestTimes(history, tz);
  return buildScheduleFactsheet({
    provider: account.provider,
    slots: rankedTimeSlots(times, 5),
    consistency: postingConsistency(history, now),
    minSampleSize: 2,
    timezone: tz,
  });
}
