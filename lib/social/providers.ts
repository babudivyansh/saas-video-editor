import { env } from "@/lib/env";
import * as google from "./google";
import * as meta from "./meta";
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
};

/** Which env credentials each OAuth app needs before a connect can succeed. */
const OAUTH_APP_CONFIGURED: Record<OAuthProvider, () => boolean> = {
  youtube: () => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  meta: () => Boolean(env.META_APP_ID && env.META_APP_SECRET),
};

/**
 * Providers whose OAuth app is actually configured in this deployment.
 *
 * This used to return every registry key regardless, contradicting its own doc
 * comment: the UI offered a Connect button that started a flow which could only
 * fail, and the user had no way to tell that from a real error.
 */
export function availableProviders(): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter((id) =>
    OAUTH_APP_CONFIGURED[PROVIDERS[id].oauthApp](),
  );
}

/** Whether one provider can be connected right now. */
export function isProviderConfigured(id: ProviderId): boolean {
  return OAUTH_APP_CONFIGURED[PROVIDERS[id].oauthApp]();
}

export interface ProviderAvailability {
  id: ProviderId;
  configured: boolean;
}

/**
 * EVERY provider, each with whether this deployment can actually connect it.
 *
 * `availableProviders()` filters unconfigured ones out, which is right for
 * anything that acts on a provider but wrong for the UI: production offered
 * only YouTube and said nothing about Instagram or Facebook, so a user with no
 * way to know about the missing META_APP_ID simply saw a product that appeared
 * to have lost two platforms. The settings page renders from this instead and
 * explains the gap.
 */
export function providerAvailability(): ProviderAvailability[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => ({
    id,
    configured: isProviderConfigured(id),
  }));
}
