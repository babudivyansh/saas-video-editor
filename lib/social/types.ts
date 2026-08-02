// Shared, provider-agnostic shapes for the Social Tracker. Each provider adapter
// (google.ts, meta.ts) normalizes its API into these so the service + UI never
// care which platform the data came from.

export type ProviderId = "youtube" | "instagram" | "facebook";

// Which OAuth app a provider authenticates through. Instagram + Facebook share
// one Meta app, so they map to the "meta" callback; YouTube uses Google.
export type OAuthProvider = "youtube" | "meta";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

export interface AccountMetrics {
  followers?: number;
  views?: number;
  impressions?: number;
  reach?: number;
  engagement?: number;
}

export interface NormalizedAccount {
  provider: ProviderId;
  providerAccountId: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  metrics: AccountMetrics;
}

export interface NormalizedPost {
  providerPostId: string;
  caption?: string;
  thumbnailUrl?: string;
  permalink?: string;
  mediaType?: string; // video | image | reel | short
  publishedAt?: Date;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  reach?: number;
  impressions?: number;
  plays?: number;
  watchTimeSec?: number;
  avgWatchTimeSec?: number;
  avgViewPercentage?: number;
  ctr?: number;
  profileVisits?: number;
  follows?: number;
  linkClicks?: number;
  navigationTaps?: number;
  metrics?: Record<string, unknown>;
}

// backfill = first sync for an account: pull deeper post history (~100) so
// analytics start meaningful. Steady-state syncs fetch only the newest page.
export interface SyncOptions {
  backfill?: boolean;
  /**
   * Earliest day to request daily metrics from. Steady-state syncs pass
   * (lastDailyMetricDate - 2 days), because providers restate the most recent
   * 24-48h; the overlap plus the (accountId, date) unique makes re-fetch
   * idempotent.
   */
  since?: Date;
}

export type AudienceDimension =
  | "age"
  | "gender"
  | "country"
  | "city"
  | "language"
  | "device"
  | "activeHour"
  | "activeDay"
  | "followerType";

// One audience demographic data point.
export interface AudienceRow {
  dimension: AudienceDimension;
  bucket: string;
  value: number;
  /**
   * "percent" (0-100) or "count". Not optional in spirit: Instagram's
   * online_followers returns ABSOLUTE COUNTS, and treating those as percentages
   * renders bars reading 4,200%. Defaults to percent for existing callers.
   */
  unit?: "percent" | "count";
  /**
   * Which population this describes. Instagram exposes follower, reached and
   * engaged demographics as three different audiences that must not be merged.
   */
  audience?: "followers" | "reached" | "engaged";
}

/** One provider-reported day, keyed by MetricKey. */
export interface NormalizedDailyMetric {
  /** yyyy-mm-dd in the provider's reporting timezone. */
  date: string;
  metrics: Record<string, number>;
}

/**
 * What a sync observed about this account's metric coverage. Narrows the static
 * matrix in ./capabilities so the UI can explain WHY a tile is empty instead of
 * showing a permanent dash.
 */
export type ObservedCapabilityMap = Record<string, "native" | "derived" | "unavailable">;

// One linked account plus its freshly-fetched analytics. `partialError` is set
// when the profile fetch succeeded but posts/insights could not be fetched —
// the sync is still persisted, and the reason is surfaced on the account.
export interface ProviderSync {
  account: NormalizedAccount;
  posts: NormalizedPost[];
  /** Per-day account metrics, when the provider reports them. */
  daily?: NormalizedDailyMetric[];
  /** Audience breakdowns, when fetched inline rather than on the weekly cadence. */
  audience?: AudienceRow[];
  observedCapabilities?: ObservedCapabilityMap;
  partialError?: string;
}
