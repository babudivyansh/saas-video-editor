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
  watchTimeSec?: number;
  metrics?: Record<string, unknown>;
}

// backfill = first sync for an account: pull deeper post history (~100) so
// analytics start meaningful. Steady-state syncs fetch only the newest page.
export interface SyncOptions {
  backfill?: boolean;
}

// One linked account plus its freshly-fetched analytics. `partialError` is set
// when the profile fetch succeeded but posts/insights could not be fetched —
// the sync is still persisted, and the reason is surfaced on the account.
export interface ProviderSync {
  account: NormalizedAccount;
  posts: NormalizedPost[];
  partialError?: string;
}
