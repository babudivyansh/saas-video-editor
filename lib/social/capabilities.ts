// Provider capability matrix — the single source of truth for "can this platform
// give us this number, and if not, why not".
//
// Four consumers read this:
//   1. Sync      — adapters fetch what is `native` (lib/social/google*.ts, meta*.ts)
//   2. Derivation— lib/social/metrics/* computes what is `derived` from `derivedFrom`
//   3. API       — every account-scoped response ships a resolved capability map
//   4. UI        — KpiCard renders the greyed "unavailable" state with a reason
//
// TWO LAYERS. The static CAPABILITIES matrix answers "can this platform's API ever
// supply this metric". The per-account overlay (SocialAccount.capabilitiesJson,
// written by the sync when a call errors or omits a metric) answers "can THIS
// account supply it right now" — an IG account under 100 followers, a channel
// connected before yt-analytics.readonly was requested, a Page without
// read_insights. Without the overlay those tiles would read "—" forever with no
// explanation. effectiveCapability() intersects the two.
//
// This module imports nothing but ./types, so it is safe to import from client
// components.

import type { ProviderId } from "./types";

export const METRIC_KEYS = [
  // audience
  "followers",
  "followersGained",
  "followersLost",
  "followerGrowthRate",
  // distribution
  "impressions",
  "reach",
  "views",
  "plays",
  // interaction
  "engagementRate",
  "totalInteractions",
  "likes",
  "comments",
  "shares",
  "saves",
  // intent
  "profileViews",
  "websiteClicks",
  "ctr",
  // video
  "watchTimeSec",
  "avgViewDurationSec",
  "avgViewPercentage",
  // publishing
  "postsPublished",
  "postingFrequency",
  // computed by us
  "viralScore",
  "healthScore",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/**
 * native      — the provider returns this directly
 * derived     — we compute it from other native metrics (see derivedFrom)
 * unavailable — the provider's public API does not expose it at all
 */
export type Support = "native" | "derived" | "unavailable";

export type MetricUnit = "count" | "percent" | "seconds" | "ratio" | "score";

export interface MetricCapability {
  support: Support;
  /** Whether the metric exists per-account, per-post, or both. */
  scope: "account" | "post" | "both";
  unit: MetricUnit;
  /** Human explanation shown in the greyed tile's tooltip. Required when unavailable. */
  reason?: string;
  /**
   * For `derived`: the candidate input metrics. Semantics are "at least one of
   * these must be available", not "all of them" — viralScore falls back from
   * `views` to `reach`, and engagementRate accepts either denominator. An empty
   * array means the metric is computed from stored rows we own (post counts,
   * timestamps) rather than from other metrics.
   */
  derivedFrom?: MetricKey[];
  /** OAuth scope that must be granted for `native` to actually hold. */
  requiresScope?: string;
}

// ── Shorthand builders ───────────────────────────────────────────────────────
const n = (
  scope: MetricCapability["scope"],
  unit: MetricUnit,
  requiresScope?: string,
): MetricCapability => ({ support: "native", scope, unit, requiresScope });

const d = (
  scope: MetricCapability["scope"],
  unit: MetricUnit,
  derivedFrom: MetricKey[],
): MetricCapability => ({ support: "derived", scope, unit, derivedFrom });

const u = (
  scope: MetricCapability["scope"],
  unit: MetricUnit,
  reason: string,
): MetricCapability => ({ support: "unavailable", scope, unit, reason });

const YT_ANALYTICS = "https://www.googleapis.com/auth/yt-analytics.readonly";
const IG_INSIGHTS = "instagram_manage_insights";
const FB_INSIGHTS = "read_insights";

// Metrics we compute ourselves from stored rows — identical across providers.
const COMPUTED: Pick<
  Record<MetricKey, MetricCapability>,
  "followerGrowthRate" | "postingFrequency" | "viralScore" | "healthScore" | "postsPublished"
> = {
  followerGrowthRate: d("account", "percent", ["followers"]),
  postsPublished: d("account", "count", []),
  postingFrequency: d("account", "ratio", ["postsPublished"]),
  viralScore: d("post", "score", ["views", "reach", "shares", "engagementRate"]),
  healthScore: d("account", "score", ["followerGrowthRate", "engagementRate", "postingFrequency"]),
};

// ── YouTube ──────────────────────────────────────────────────────────────────
// Data API v3 for profile + video metadata, Analytics API v2 for everything
// time-series. The two hard zeros below are real: impressions and impression CTR
// are surfaced only in YouTube Studio and are exposed by neither the Analytics
// API v2 nor the bulk Reporting API.
const YOUTUBE: Record<MetricKey, MetricCapability> = {
  followers: n("account", "count"),
  followersGained: n("account", "count", YT_ANALYTICS), // subscribersGained
  followersLost: n("account", "count", YT_ANALYTICS), // subscribersLost
  impressions: u(
    "both",
    "count",
    "YouTube exposes impressions only in YouTube Studio — no public API returns them.",
  ),
  reach: u(
    "both",
    "count",
    "YouTube has no reach metric. Unique viewers is a different measure and is not a substitute.",
  ),
  views: n("both", "count"),
  plays: n("both", "count"),
  engagementRate: d("both", "percent", ["likes", "comments", "shares", "views"]),
  totalInteractions: d("both", "count", ["likes", "comments", "shares"]),
  likes: n("both", "count"),
  comments: n("both", "count"),
  shares: n("both", "count", YT_ANALYTICS),
  saves: d("both", "count", ["views"]), // videosAddedToPlaylists
  profileViews: u(
    "account",
    "count",
    "YouTube does not report channel profile visits through any public API.",
  ),
  websiteClicks: u("account", "count", "YouTube does not report outbound link clicks."),
  ctr: u(
    "both",
    "percent",
    "Impression click-through rate is a YouTube Studio–only metric; it is not in the Analytics API.",
  ),
  watchTimeSec: n("both", "seconds", YT_ANALYTICS), // estimatedMinutesWatched × 60
  avgViewDurationSec: n("both", "seconds", YT_ANALYTICS),
  avgViewPercentage: n("both", "percent", YT_ANALYTICS),
  ...COMPUTED,
};

// ── Instagram ────────────────────────────────────────────────────────────────
// Graph API v22. Meta removed the `impressions` metric for IG media and accounts
// in v22, so impressions is derived from `views` rather than fetched.
const INSTAGRAM: Record<MetricKey, MetricCapability> = {
  followers: n("account", "count"),
  followersGained: n("account", "count", IG_INSIGHTS), // follower_count (daily net)
  followersLost: d("account", "count", ["followers", "followersGained"]),
  impressions: d(
    "both",
    "count",
    ["views"], // Meta retired IG impressions in Graph v22
  ),
  reach: n("both", "count", IG_INSIGHTS),
  views: n("both", "count", IG_INSIGHTS),
  plays: n("post", "count", IG_INSIGHTS),
  engagementRate: d("both", "percent", ["totalInteractions", "reach"]),
  totalInteractions: n("both", "count", IG_INSIGHTS),
  likes: n("both", "count"),
  comments: n("both", "count"),
  shares: n("both", "count", IG_INSIGHTS),
  saves: n("both", "count", IG_INSIGHTS), // `saved`
  profileViews: n("account", "count", IG_INSIGHTS),
  websiteClicks: n("account", "count", IG_INSIGHTS),
  ctr: d("account", "percent", ["websiteClicks", "impressions"]),
  watchTimeSec: n("post", "seconds", IG_INSIGHTS), // ig_reels_video_view_total_time
  avgViewDurationSec: n("post", "seconds", IG_INSIGHTS), // ig_reels_avg_watch_time
  avgViewPercentage: u(
    "post",
    "percent",
    "Instagram does not expose video length alongside watch time, so completion rate cannot be computed reliably.",
  ),
  ...COMPUTED,
};

// ── Facebook ─────────────────────────────────────────────────────────────────
const FACEBOOK: Record<MetricKey, MetricCapability> = {
  followers: n("account", "count"), // page_fans
  followersGained: n("account", "count", FB_INSIGHTS), // page_fan_adds
  followersLost: n("account", "count", FB_INSIGHTS), // page_fan_removes
  impressions: n("both", "count", FB_INSIGHTS), // page_impressions / post_impressions
  reach: n("both", "count", FB_INSIGHTS), // *_unique
  views: n("both", "count", FB_INSIGHTS),
  plays: n("post", "count", FB_INSIGHTS), // post_video_views
  engagementRate: d("both", "percent", ["totalInteractions", "reach"]),
  totalInteractions: d("both", "count", ["likes", "comments", "shares"]),
  likes: n("both", "count"),
  comments: n("both", "count"),
  shares: n("both", "count"),
  saves: u("both", "count", "Facebook has no saves metric for Page posts."),
  profileViews: n("account", "count", FB_INSIGHTS), // page_views_total
  websiteClicks: n("both", "count", FB_INSIGHTS), // post_clicks
  ctr: d("both", "percent", ["websiteClicks", "impressions"]),
  watchTimeSec: n("post", "seconds", FB_INSIGHTS),
  avgViewDurationSec: n("post", "seconds", FB_INSIGHTS), // post_video_avg_time_watched
  avgViewPercentage: d("post", "percent", ["avgViewDurationSec"]),
  ...COMPUTED,
};

export const CAPABILITIES: Record<ProviderId, Record<MetricKey, MetricCapability>> = {
  youtube: YOUTUBE,
  instagram: INSTAGRAM,
  facebook: FACEBOOK,
};

/** Per-account overlay, persisted on SocialAccount.capabilitiesJson. */
export type ObservedCapabilities = Partial<Record<MetricKey, Support>>;

export function capability(provider: ProviderId, metric: MetricKey): MetricCapability {
  return CAPABILITIES[provider][metric];
}

/**
 * The static matrix narrowed by what this specific account was actually observed
 * to return. The overlay can only ever *downgrade* — an account cannot expose a
 * metric its platform doesn't have, but it can fail to expose one the platform
 * does (missing scope, too few followers, a provider-side error).
 */
export function effectiveCapability(
  provider: ProviderId,
  metric: MetricKey,
  observed?: ObservedCapabilities | null,
): MetricCapability {
  const base = capability(provider, metric);
  const seen = observed?.[metric];
  if (!seen || seen === base.support) return base;
  if (seen === "unavailable" && base.support !== "unavailable") {
    return {
      ...base,
      support: "unavailable",
      reason:
        base.requiresScope != null
          ? `Not available for this account — reconnect to grant "${base.requiresScope}".`
          : "Not available for this account. The platform returned no data for this metric.",
    };
  }
  // A native metric that only came back derived (e.g. we fell back to a proxy).
  if (seen === "derived" && base.support === "native") {
    return { ...base, support: "derived" };
  }
  return base;
}

export function isAvailable(
  provider: ProviderId,
  metric: MetricKey,
  observed?: ObservedCapabilities | null,
): boolean {
  return effectiveCapability(provider, metric, observed).support !== "unavailable";
}

/** Metrics an adapter should actually request from the provider. */
export function nativeMetrics(provider: ProviderId): MetricKey[] {
  return METRIC_KEYS.filter((m) => CAPABILITIES[provider][m].support === "native");
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
};

/** Tooltip text for a greyed KPI tile. */
export function unavailableLabel(
  provider: ProviderId,
  metric: MetricKey,
  observed?: ObservedCapabilities | null,
): string {
  const cap = effectiveCapability(provider, metric, observed);
  const head = `Not available on ${PROVIDER_LABEL[provider]}`;
  return cap.reason ? `${head} — ${cap.reason}` : head;
}

/** Resolved map for one account, shipped in every account-scoped API response. */
export function capabilityMap(
  provider: ProviderId,
  observed?: ObservedCapabilities | null,
): Record<MetricKey, Support> {
  const out = {} as Record<MetricKey, Support>;
  for (const m of METRIC_KEYS) out[m] = effectiveCapability(provider, m, observed).support;
  return out;
}

/**
 * Across several accounts a metric is available if ANY of them supplies it —
 * the aggregate tile shows a partial total rather than nothing. `derived` wins
 * over `unavailable`, `native` over both.
 */
export function mergeCapabilities(
  maps: Array<Record<MetricKey, Support>>,
): Record<MetricKey, Support> {
  const rank: Record<Support, number> = { unavailable: 0, derived: 1, native: 2 };
  const out = {} as Record<MetricKey, Support>;
  for (const m of METRIC_KEYS) {
    let best: Support = "unavailable";
    for (const map of maps) if (rank[map[m]] > rank[best]) best = map[m];
    out[m] = best;
  }
  return out;
}
