import { z } from "zod";

// Insights and account analytics. Values mirror the web's Social Tracker
// (lib/social/schemas.ts, lib/social/capabilities.ts, lib/social/competitors.ts,
// lib/tool-costs.ts), pinned by lib/mobile-insights-schema.test.ts.

/** Platforms the Social Tracker supports (no TikTok: not available in India). */
export const PROVIDERS = ["youtube", "instagram", "facebook"] as const;
export const providerSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof providerSchema>;
export const PROVIDER_LABEL: Record<Provider, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };

/** Analytics periods, days (rangeDaysSchema on the web). */
export const RANGE_DAYS = [7, 14, 30, 90, 180, 365] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
export const rangeLabel = (d: RangeDays) => (d === 365 ? "1Y" : `${d}D`);

export const INSIGHT_METRICS = ["followers", "views", "engagementRate", "totalInteractions", "likes", "comments", "shares", "saves", "watchTimeSec", "avgViewPercentage"] as const;
export type InsightMetric = (typeof INSIGHT_METRICS)[number];

/**
 * What each platform can report. "unavailable" metrics show "—" with the
 * reason, never a made-up zero. Copied from the web's capability matrix.
 */
export const METRIC_SUPPORT: Record<Provider, Partial<Record<InsightMetric, { support: "native" | "derived" | "unavailable"; reason?: string }>>> = {
  youtube: {},
  instagram: {
    avgViewPercentage: { support: "unavailable", reason: "Instagram does not expose video length alongside watch time, so completion rate cannot be computed reliably." },
  },
  facebook: {
    saves: { support: "unavailable", reason: "Facebook has no saves metric for Page posts." },
  },
};
export const unavailableReason = (p: Provider, m: InsightMetric) => (METRIC_SUPPORT[p][m]?.support === "unavailable" ? (METRIC_SUPPORT[p][m]?.reason ?? "Not available") : null);

export const MAX_COMPETITORS = 3;
export const COMPETITOR_PROVIDERS: readonly Provider[] = ["instagram", "youtube"];
/** The weekly AI summary's price in AI credits (social-exec-report). */
export const WEEKLY_SUMMARY_CREDITS = 5;
export const REPORT_FORMATS = ["pdf", "csv", "xlsx"] as const;

// ── Shapes ────────────────────────────────────────────────────────────────

const delta = z.number().nullable(); // % change vs the previous period
export const socialAccountSchema = z.object({
  id: z.string(),
  provider: providerSchema,
  name: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  followers: z.number().int().nonnegative(),
  health: z.enum(["healthy", "reconnect", "syncing"]),
  lastSyncedAt: z.string().nullable(),
});
export type SocialAccount = z.infer<typeof socialAccountSchema>;

export const kpiSchema = z.object({ value: z.number().nullable(), delta });
export type Kpi = z.infer<typeof kpiSchema>;

export const insightsOverviewSchema = z.object({
  range: z.number(),
  /** True while accounts are still on their first sync: figures are samples. */
  sample: z.boolean(),
  totals: z.object({ views: kpiSchema, followers: kpiSchema, engagementRate: kpiSchema, clipsPosted: kpiSchema }),
  series: z.array(z.object({ date: z.string(), value: z.number() })),
  byPlatform: z.array(z.object({ provider: providerSchema, share: z.number().min(0).max(100) })),
  topClip: z.object({ title: z.string(), views: z.number(), provider: providerSchema, thumbnailUrl: z.string() }).nullable(),
});
export type InsightsOverview = z.infer<typeof insightsOverviewSchema>;

export const contentPostSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: providerSchema,
  format: z.string(),
  thumbnailUrl: z.string(),
  views: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
});
export type ContentPost = z.infer<typeof contentPostSchema>;

export const contentPerformanceSchema = z.object({
  avgViews: z.number().nullable(),
  avgWatchPercent: z.number().nullable(),
  /** Start of the best 4-hour posting block, e.g. "6 PM"; null with too few posts. */
  bestTime: z.string().nullable(),
  posts: z.array(contentPostSchema),
});
export type ContentPerformance = z.infer<typeof contentPerformanceSchema>;

export const audienceBucketSchema = z.object({ label: z.string(), percent: z.number().min(0).max(100) });
export const platformAnalyticsSchema = z.object({
  provider: providerSchema,
  followers: kpiSchema,
  views: kpiSchema,
  engagementRate: kpiSchema,
  watchTimeHours: kpiSchema,
  growth: z.array(z.object({ date: z.string(), value: z.number() })),
  age: z.array(audienceBucketSchema),
  countries: z.array(audienceBucketSchema),
});
export type PlatformAnalytics = z.infer<typeof platformAnalyticsSchema>;

export type ContentSort = "views" | "likes" | "comments" | "shares";
export const sortContent = (posts: ContentPost[], by: ContentSort) => [...posts].sort((a, b) => b[by] - a[by]);

/** "412k", "26.1k", "1.2M". */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 100_000) return `${Math.round(n / 1000)}k`;
  if (abs >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}
