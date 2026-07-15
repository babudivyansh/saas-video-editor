import * as google from "./google";
import * as meta from "./meta";
import * as tiktok from "./tiktok";
import type { AudienceRow, OAuthProvider, OAuthTokens, ProviderId, ProviderSync, SyncOptions } from "./types";

// One uniform surface per platform so the sync engine and routes never branch
// on provider names. Adding a platform = implement this interface in a new
// module and register it below (plus ProviderId in types.ts and a UI card).
//
// OAuth code exchange + multi-account discovery stay in service.handleCallback:
// they are per-OAuth-app concerns (one Meta grant yields several accounts), not
// per-account ones, and forcing them through this interface would contort it.
export interface ProviderAdapter {
  oauthApp: OAuthProvider;
  getAuthUrl(state: string, challenge: string): string;
  refreshTokens(refreshToken: string, providerAccountId: string): Promise<OAuthTokens>;
  sync(providerAccountId: string, accessToken: string, opts?: SyncOptions): Promise<ProviderSync>;
  revoke(token: string): Promise<void>;
  // Audience demographics for the authenticated account — only where the
  // platform exposes them (YouTube Analytics, IG follower insights).
  fetchAudience?(providerAccountId: string, accessToken: string): Promise<AudienceRow[]>;
}

const youtube: ProviderAdapter = {
  oauthApp: "youtube",
  getAuthUrl: google.getAuthUrl,
  refreshTokens: (refreshToken) => google.refreshAccessToken(refreshToken),
  sync: (_providerAccountId, accessToken, opts) => google.sync(accessToken, opts),
  revoke: google.revoke,
  fetchAudience: (_providerAccountId, accessToken) => google.fetchAudience(accessToken),
};

function metaAdapter(provider: Extract<ProviderId, "instagram" | "facebook">): ProviderAdapter {
  return {
    oauthApp: "meta",
    getAuthUrl: meta.getAuthUrl,
    refreshTokens: (refreshToken, providerAccountId) => meta.refreshTokens(refreshToken, provider, providerAccountId),
    sync: (providerAccountId, accessToken, opts) => meta.syncAccount(providerAccountId, provider, accessToken, opts),
    revoke: meta.revoke,
    ...(provider === "instagram"
      ? { fetchAudience: (providerAccountId: string, accessToken: string) => meta.fetchAudienceInstagram(providerAccountId, accessToken) }
      : {}),
  };
}

export const PROVIDERS: Record<ProviderId, ProviderAdapter> = {
  youtube,
  instagram: metaAdapter("instagram"),
  facebook: metaAdapter("facebook"),
  tiktok: {
    oauthApp: "tiktok",
    getAuthUrl: tiktok.getAuthUrl,
    refreshTokens: (refreshToken) => tiktok.refreshTokens(refreshToken),
    sync: (_providerAccountId, accessToken, opts) => tiktok.sync(accessToken, opts),
    revoke: tiktok.revoke,
  },
};

// Providers whose OAuth app is actually configured in this deployment — the
// UI only offers these. YouTube/Meta cards keep their historical always-on
// behavior (their connect flow reports missing config); TikTok is opt-in.
export function availableProviders(): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((p) => p !== "tiktok" || tiktok.isConfigured());
}
