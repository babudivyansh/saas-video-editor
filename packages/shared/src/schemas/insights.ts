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

// ── Account analytics (Overview, Audience, Competitors, Reports) ──────────

export const REPORT_SECTIONS = [
  { id: "kpis", label: "KPIs" },
  { id: "trends", label: "Trends" },
  { id: "content", label: "Content" },
  { id: "audience", label: "Audience" },
  { id: "competitors", label: "Competitors" },
  { id: "ai", label: "AI summary" },
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number]["id"];
export const REPORT_SCHEDULES = ["none", "weekly", "monthly"] as const;
export type ReportSchedule = (typeof REPORT_SCHEDULES)[number];
export type ReportFormat = (typeof REPORT_FORMATS)[number];
/** Share links (app/api/social/report-link): default and maximum lifetime, days. */
export const SHARE_LINK_DEFAULT_DAYS = 7;
export const SHARE_LINK_MAX_DAYS = 90;

export const reportRequest = z.object({
  name: z.string().trim().min(1, "Name the report").max(120),
  accountIds: z.array(z.string()).min(1, "Pick at least one account").max(10),
  sections: z.array(z.enum(REPORT_SECTIONS.map((s) => s.id) as [ReportSection, ...ReportSection[]])).min(1, "Pick at least one section"),
  format: z.enum(REPORT_FORMATS),
  schedule: z.enum(REPORT_SCHEDULES),
});
export type ReportRequest = z.infer<typeof reportRequest>;

export const savedReportSchema = reportRequest.extend({ id: z.string() });
export type SavedReport = z.infer<typeof savedReportSchema>;
export const reportFileSchema = z.object({
  id: z.string(),
  title: z.string(),
  format: z.enum(REPORT_FORMATS),
  status: z.enum(["running", "ready", "failed"]),
  sizeBytes: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
});
export type ReportFile = z.infer<typeof reportFileSchema>;
/** A read-only share link; `name` says what it shows (the web stores no name: accounts · sections). */
export const shareLinkSchema = z.object({ id: z.string(), name: z.string(), views: z.number().int().nonnegative(), expiresAt: z.string() });
export type ShareLink = z.infer<typeof shareLinkSchema>;

/** GET /social/reports — saved report setups, the files made from them, and active share links. */
export const reportsResponse = z.object({ saved: z.array(savedReportSchema), files: z.array(reportFileSchema), links: z.array(shareLinkSchema) });
/** POST /social/reports (reportRequest) → 202: the file being made. */
export const reportCreatedResponse = z.object({ file: reportFileSchema });
/** GET /social/reports/:id/download → a short-lived link to a ready file. */
export const reportDownloadResponse = z.object({ url: z.string(), filename: z.string() });
/** POST /social/share-links. The link's URL is only ever returned here (the web stores a token id, not the URL). */
export const shareLinkRequest = z.object({
  accountIds: z.array(z.string()).min(1, "Pick at least one account").max(10),
  days: z.number().int().min(1).max(SHARE_LINK_MAX_DAYS),
});
export const shareLinkCreatedResponse = z.object({ link: shareLinkSchema, url: z.string() });
/** GET /social/export?accountId= → one account's posts as CSV (the web's own export, formula-safe). */
export const csvExportResponse = z.object({ filename: z.string(), csv: z.string(), rows: z.number().int().nonnegative() });

export const competitorSchema = z.object({
  id: z.string(),
  provider: providerSchema,
  name: z.string(),
  handle: z.string(),
  avatarUrl: z.string().nullable(),
  followers: z.number().int().nonnegative(),
  engagementRate: z.number().nonnegative(),
  postsPerWeek: z.number().nonnegative(),
  followerChange: z.number(),
  lastSyncedAt: z.string(),
});
export type Competitor = z.infer<typeof competitorSchema>;
/** Public handle as the web accepts it (lib/social/schemas.ts handle regex). */
export const competitorHandleSchema = z
  .string()
  .trim()
  .transform((h) => h.replace(/^@/, ""))
  .pipe(z.string().regex(/^[\w.\-]{2,60}$/, "Enter a public @handle (letters, numbers, . _ -)"));

export const audienceSchema = z.object({
  provider: providerSchema,
  followers: z.number().int().nonnegative(),
  followersGainedThisMonth: z.number().int(),
  gender: z.object({ women: z.number(), men: z.number(), other: z.number() }),
  age: z.array(audienceBucketSchema),
  /** 7 days (Mon first) × 6 four-hour blocks (12a, 4a, 8a, 12p, 4p, 8p), 0–100. */
  online: z.array(z.array(z.number().min(0).max(100)).length(6)).length(7),
  countries: z.array(audienceBucketSchema),
  cities: z.array(audienceBucketSchema),
});
export type Audience = z.infer<typeof audienceSchema>;
export const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const BLOCK_LABELS = ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"] as const;
/** The busiest day/block, e.g. "Mon 6 PM" is shown as the block start "Mon 4 PM". */
export function bestOnline(online: number[][]): { day: number; block: number } {
  let best = { day: 0, block: 0, v: -1 };
  online.forEach((row, d) => row.forEach((v, b) => v > best.v && (best = { day: d, block: b, v })));
  return { day: best.day, block: best.block };
}

export const analyticsOverviewSchema = z.object({
  totalFollowers: kpiSchema.extend({ gained: z.number().int() }),
  followerSeries: z.array(z.object({ date: z.string(), value: z.number() })),
  views: kpiSchema,
  engagementRate: kpiSchema,
  interactions: kpiSchema,
  topShare: z.object({ provider: providerSchema, percent: z.number() }),
  healthScore: z.number().int().min(0).max(100).nullable(),
});
export type AnalyticsOverview = z.infer<typeof analyticsOverviewSchema>;

// ── Mobile API (/api/mobile/v1/social) ─────────────────────────────────────
// Social Tracker is a subscriber feature, as on the web: without an active
// plan every route answers 402 { code: "subscription_required" }.

/** GET /social/accounts */
/** GET /social/accounts; `connectable` = platforms that can be connected right now (set up on the server). */
export const socialAccountsResponse = z.object({ accounts: z.array(socialAccountSchema), connectable: z.array(providerSchema).default([]) });
/** GET /social/connect/:provider → the platform's sign-in page (opened in an auth session; it ends at clipiro://social). */
export const connectUrlResponse = z.object({ url: z.string() });
/** POST /social/connect/complete: finishes a connect the callback parked as clipiro://social?pending=… */
export const connectCompleteRequest = z.object({ pending: z.string().min(1).max(200) });
export const connectCompleteResponse = z.object({ connected: z.array(providerSchema) });

/** GET /social/competitors */
export const competitorsResponse = z.object({
  competitors: z.array(competitorSchema),
  /** False when competitor tracking isn't set up on the server. */
  enabled: z.boolean(),
  max: z.number().int(),
  /**
   * Your own accounts, measured the same way as competitors ((avg likes + avg
   * comments) / followers, and posts a week, over the last 30 days), for the
   * "You vs. competitors" table. Null when there's too little to measure.
   */
  mine: z.array(z.object({ accountId: z.string(), provider: providerSchema, engagementRate: z.number().nullable(), postsPerWeek: z.number().nullable() })).default([]),
});
/** POST /social/competitors */
export const addCompetitorRequest = z.object({ provider: z.enum(["instagram", "youtube"]), handle: competitorHandleSchema });

export const SUMMARY_PERIODS = ["weekly", "monthly"] as const;
/** The AI executive summary for one account (GET reads the latest; POST makes one, WEEKLY_SUMMARY_CREDITS). */
export const weeklySummarySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  period: z.enum(SUMMARY_PERIODS),
  periodStart: z.string(),
  periodEnd: z.string(),
  createdAt: z.string(),
  summary: z.string(),
  wins: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendations: z.array(z.object({ title: z.string(), why: z.string() })),
});
export type WeeklySummary = z.infer<typeof weeklySummarySchema>;
export const summaryResponse = z.object({ summary: weeklySummarySchema.nullable() });
export const summaryRequest = z.object({ accountId: z.string().min(1), period: z.enum(SUMMARY_PERIODS).default("weekly") });
