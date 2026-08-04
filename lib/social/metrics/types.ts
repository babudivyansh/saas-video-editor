// Row shapes the pure metrics modules accept. Deliberately structural rather
// than Prisma-generated: callers pass plain objects, so every formula is
// testable with a literal and nothing in lib/social/metrics imports the client.

/** A cumulative lifetime capture (SocialAccountSnapshot). Monotonic. */
export interface SnapshotRow {
  capturedAt: Date;
  followers?: number | null;
  views?: number | null;
  impressions?: number | null;
  reach?: number | null;
  engagement?: number | null;
}

/** A published post with whatever metrics the provider gave us. */
export interface PostRow {
  id: string;
  caption?: string | null;
  thumbnailUrl?: string | null;
  permalink?: string | null;
  mediaType?: string | null;
  publishedAt?: Date | null;
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  reach?: number | null;
  impressions?: number | null;
  watchTimeSec?: number | null;
  avgWatchTimeSec?: number | null;
  avgViewPercentage?: number | null;
  ctr?: number | null;
}

/**
 * One provider-reported day (SocialDailyMetric). These are per-day deltas, not
 * running totals — sum them across a window, never subtract.
 */
export interface DailyMetricRow {
  /** Local calendar day, yyyy-mm-dd. */
  date: string;
  impressions?: number | null;
  reach?: number | null;
  views?: number | null;
  plays?: number | null;
  followers?: number | null; // cumulative mirror, for join-free charts
  followersGained?: number | null;
  followersLost?: number | null;
  profileViews?: number | null;
  websiteClicks?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  totalInteractions?: number | null;
  accountsEngaged?: number | null;
  watchTimeSec?: number | null;
  avgViewDurationSec?: number | null;
  avgViewPercentage?: number | null;
  ctr?: number | null;
  postsPublished?: number | null;
}

/** One audience breakdown bucket. */
export interface AudienceRowLike {
  dimension: string;
  bucket: string;
  value: number;
  /** "percent" (0–100) or "count" — IG online_followers returns absolute counts. */
  unit?: string;
  /** followers | reached | engaged — three different IG populations. */
  audience?: string;
}
