import { redirectUri } from "./oauth";
import { ProviderApiError } from "./errors";
import { batchMostlyFailed, graphBatch } from "./meta-batch";
import type { AudienceRow, NormalizedAccount, NormalizedPost, OAuthTokens, ProviderId, ProviderSync, SyncOptions } from "./types";
import { env } from "@/lib/env";

// Instagram + Facebook via one Meta app (Facebook Login + Graph API v22.0).
// A single OAuth grant yields a long-lived USER token; from it we derive a
// long-lived PAGE token per Facebook Page, and each Page may have a linked
// Instagram Business account (whose insights also use the Page token).
//
// Read-only / insights scopes only — no publishing or messaging.
const V = "v22.0";
const DIALOG = `https://www.facebook.com/${V}/dialog/oauth`;
const GRAPH = `https://graph.facebook.com/${V}`;

const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
];

function appId() {
  const id = env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID is not configured");
  return id;
}
function appSecret() {
  const s = env.META_APP_SECRET;
  if (!s) throw new Error("META_APP_SECRET is not configured");
  return s;
}

export function getAuthUrl(state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_id: appId(),
    redirect_uri: redirectUri("meta"),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${DIALOG}?${p.toString()}`;
}

// Exchange the auth code for a SHORT-lived user token, then upgrade it to a
// LONG-lived (~60 day) user token.
export async function exchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const shortRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId(),
        client_secret: appSecret(),
        redirect_uri: redirectUri("meta"),
        code,
        code_verifier: verifier,
      }),
  );
  if (!shortRes.ok) throw new ProviderApiError(`meta token exchange failed: ${shortRes.status}`, shortRes.status, await shortRes.text());
  const short = (await shortRes.json()) as { access_token: string };

  const longRes = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId(),
        client_secret: appSecret(),
        fb_exchange_token: short.access_token,
      }),
  );
  const long = longRes.ok
    ? ((await longRes.json()) as { access_token: string; expires_in?: number })
    : { access_token: short.access_token };
  const expiresIn = Number(long.expires_in ?? 0);
  return {
    accessToken: long.access_token,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scopes: SCOPES,
  };
}

// Refresh a Meta connection before its long-lived USER token (~60 days) lapses.
// The user token is what we keep as the "refresh credential" (refreshTokenEnc);
// extending it via fb_exchange_token and re-listing /me/accounts yields a fresh
// Page token for this account (Page tokens derived from a long-lived user token
// are what accessTokenEnc stores). Meta may omit expires_in for tokens it
// considers non-expiring — treat that as long-lived rather than an error.
export async function refreshTokens(
  userToken: string,
  provider: Extract<ProviderId, "facebook" | "instagram">,
  providerAccountId: string,
): Promise<OAuthTokens> {
  const res = await fetch(
    `${GRAPH}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId(),
        client_secret: appSecret(),
        fb_exchange_token: userToken,
      }),
  );
  if (!res.ok) throw new ProviderApiError(`meta token refresh failed: ${res.status}`, res.status, await res.text());
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresIn = Number(j.expires_in ?? 0);

  const connected = await fetchAccounts(j.access_token);
  const match = connected.find(
    (c) => c.account.provider === provider && c.account.providerAccountId === providerAccountId,
  );
  if (!match) {
    throw new Error(`meta token refresh: ${provider} account ${providerAccountId} no longer granted to this app`);
  }
  return {
    accessToken: match.pageAccessToken,
    refreshToken: j.access_token, // rotated long-lived user token
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scopes: SCOPES,
  };
}

export interface MetaConnected {
  account: NormalizedAccount;
  pageAccessToken: string; // long-lived Page token (also used for the linked IG account)
}

interface MetaPage {
  id: string;
  name?: string;
  access_token: string;
  fan_count?: number;
  followers_count?: number;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    followers_count?: number;
    media_count?: number;
    profile_picture_url?: string;
  };
}

// List the user's Pages (+ linked IG Business accounts) and their Page tokens.
export async function fetchAccounts(userToken: string): Promise<MetaConnected[]> {
  const fields =
    "id,name,access_token,fan_count,followers_count,picture{url}," +
    "instagram_business_account{id,username,followers_count,media_count,profile_picture_url}";
  const res = await fetch(`${GRAPH}/me/accounts?fields=${encodeURIComponent(fields)}&limit=50`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  if (!res.ok) throw new ProviderApiError(`meta /me/accounts failed: ${res.status}`, res.status, await res.text());
  const j = (await res.json()) as { data?: MetaPage[] };

  const out: MetaConnected[] = [];
  for (const page of j.data ?? []) {
    out.push({
      account: {
        provider: "facebook",
        providerAccountId: page.id,
        displayName: page.name,
        avatarUrl: page.picture?.data?.url,
        metrics: { followers: page.followers_count ?? page.fan_count },
      },
      pageAccessToken: page.access_token,
    });
    const ig = page.instagram_business_account;
    if (ig?.id) {
      out.push({
        account: {
          provider: "instagram",
          providerAccountId: ig.id,
          username: ig.username,
          displayName: ig.username,
          avatarUrl: ig.profile_picture_url,
          metrics: { followers: ig.followers_count },
        },
        pageAccessToken: page.access_token,
      });
    }
  }
  return out;
}

async function graph(path: string, token: string): Promise<Record<string, unknown>> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${GRAPH}${path}${sep}access_token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new ProviderApiError(`meta graph ${path} failed: ${res.status}`, res.status, await res.text());
  return res.json();
}

// Follow Graph API cursor pagination (paging.next is a complete URL that
// already carries the access token) until `max` items are collected.
async function graphPaged<T>(firstPath: string, token: string, max: number): Promise<T[]> {
  const items: T[] = [];
  let page = (await graph(firstPath, token)) as { data?: T[]; paging?: { next?: string } };
  items.push(...(page.data ?? []));
  while (page.paging?.next && items.length < max) {
    const res = await fetch(page.paging.next);
    if (!res.ok) break; // pagination is best-effort past the first page
    page = (await res.json()) as { data?: T[]; paging?: { next?: string } };
    items.push(...(page.data ?? []));
  }
  return items.slice(0, max);
}

const BACKFILL_POSTS = 100;
const STEADY_POSTS = 20;

// Per-post insight metrics.
//
// VERIFY THESE AGAINST A LIVE ACCOUNT BEFORE TRUSTING THEM. Meta retires
// insight metrics aggressively — `impressions` was removed for IG media in
// Graph v22 — and a single unsupported name fails the whole sub-request rather
// than being ignored. scripts/social-probe.mjs reports which of these actually
// return data for a given account; lib/social/capabilities.ts should be authored
// from that output, not from documentation.
const FB_POST_METRICS = [
  "post_impressions",
  "post_impressions_unique",
  "post_engaged_users",
  "post_clicks",
  "post_video_views",
  "post_video_avg_time_watched",
] as const;

const IG_MEDIA_METRICS = ["reach", "saved", "shares", "views", "profile_visits", "follows"] as const;

/** Reels-only. Requesting these on other media types fails the sub-request. */
const IG_REEL_METRICS = ["ig_reels_avg_watch_time", "ig_reels_video_view_total_time"] as const;

// Re-fetch one account's profile + recent posts/media with analytics.
export async function syncAccount(
  providerAccountId: string,
  provider: Extract<ProviderId, "facebook" | "instagram">,
  pageToken: string,
  opts?: SyncOptions,
): Promise<ProviderSync> {
  return provider === "facebook"
    ? syncFacebook(providerAccountId, pageToken, opts)
    : syncInstagram(providerAccountId, pageToken, opts);
}

async function syncFacebook(pageId: string, token: string, opts?: SyncOptions): Promise<ProviderSync> {
  const p = (await graph(`/${pageId}?fields=name,followers_count,fan_count,picture{url}`, token)) as {
    name?: string;
    followers_count?: number;
    fan_count?: number;
    picture?: { data?: { url?: string } };
  };
  const account: NormalizedAccount = {
    provider: "facebook",
    providerAccountId: pageId,
    displayName: p.name,
    avatarUrl: p.picture?.data?.url,
    metrics: { followers: p.followers_count ?? p.fan_count },
  };

  let posts: NormalizedPost[] = [];
  let partialError: string | undefined;
  try {
    const max = opts?.backfill ? BACKFILL_POSTS : STEADY_POSTS;
    const feed = await graphPaged<{ id: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string }>(
      `/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=${Math.min(max, 50)}`,
      token,
      max,
    );
    // Batched, not one call per post: a 100-post backfill previously fired 100
    // concurrent Graph calls, which trips Meta's app-wide Business Use Case
    // rate limit and degrades every user's sync.
    const insights = await graphBatch<InsightsResponse>(
      GRAPH,
      feed.map((post) => ({
        method: "GET" as const,
        relative_url: `${post.id}/insights?metric=${FB_POST_METRICS.join(",")}`,
      })),
      token,
    );

    posts = feed.map((post, i) => {
      const result = insights[i];
      const m = result?.ok ? readInsights(result.body) : {};
      return {
        providerPostId: post.id,
        caption: post.message,
        thumbnailUrl: post.full_picture,
        permalink: post.permalink_url,
        mediaType: "post",
        publishedAt: post.created_time ? new Date(post.created_time) : undefined,
        impressions: m.post_impressions,
        reach: m.post_impressions_unique ?? m.post_impressions,
        likes: m.post_engaged_users,
        views: m.post_video_views,
        linkClicks: m.post_clicks,
        avgWatchTimeSec:
          typeof m.post_video_avg_time_watched === "number"
            ? m.post_video_avg_time_watched / 1000 // Graph reports milliseconds
            : undefined,
      } satisfies NormalizedPost;
    });

    if (batchMostlyFailed(insights)) {
      partialError = "Facebook post insights were mostly unavailable for this sync.";
    }
  } catch (e) {
    // Profile synced fine but posts didn't — persist what we have and surface why.
    partialError = `Facebook posts could not be fetched: ${(e as Error).message}`;
  }
  return { account, posts, partialError };
}

async function syncInstagram(igId: string, token: string, opts?: SyncOptions): Promise<ProviderSync> {
  const ig = (await graph(`/${igId}?fields=username,followers_count,media_count,profile_picture_url`, token)) as {
    username?: string;
    followers_count?: number;
    media_count?: number;
    profile_picture_url?: string;
  };
  const account: NormalizedAccount = {
    provider: "instagram",
    providerAccountId: igId,
    username: ig.username,
    displayName: ig.username,
    avatarUrl: ig.profile_picture_url,
    metrics: { followers: ig.followers_count },
  };

  let posts: NormalizedPost[] = [];
  let partialError: string | undefined;
  try {
    const max = opts?.backfill ? BACKFILL_POSTS : STEADY_POSTS;
    const media = await graphPaged<{
      id: string;
      caption?: string;
      media_type?: string;
      media_product_type?: string;
      permalink?: string;
      thumbnail_url?: string;
      media_url?: string;
      timestamp?: string;
      like_count?: number;
      comments_count?: number;
    }>(
      `/${igId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=${Math.min(max, 50)}`,
      token,
      max,
    );
    // Reels expose watch-time metrics that other media types reject outright, so
    // the metric list is per-item rather than uniform — asking for
    // ig_reels_avg_watch_time on a carousel fails the whole sub-request.
    const isReel = (item: { media_product_type?: string; media_type?: string }) =>
      (item.media_product_type || item.media_type || "").toLowerCase() === "reels";

    const insights = await graphBatch<InsightsResponse>(
      GRAPH,
      media.map((item) => ({
        method: "GET" as const,
        relative_url: `${item.id}/insights?metric=${(isReel(item)
          ? [...IG_MEDIA_METRICS, ...IG_REEL_METRICS]
          : IG_MEDIA_METRICS
        ).join(",")}`,
      })),
      token,
    );

    posts = media.map((item, i) => {
      const result = insights[i];
      const m = result?.ok ? readInsights(result.body) : {};
      return {
        providerPostId: item.id,
        caption: item.caption,
        thumbnailUrl: item.thumbnail_url || item.media_url,
        permalink: item.permalink,
        mediaType: isReel(item) ? "reel" : item.media_type?.toLowerCase(),
        publishedAt: item.timestamp ? new Date(item.timestamp) : undefined,
        likes: item.like_count,
        comments: item.comments_count,
        reach: m.reach,
        saves: m.saved,
        shares: m.shares,
        views: m.views,
        // Meta retired `impressions` for IG media in Graph v22; views is the
        // documented stand-in, and capabilities.ts marks it as derived.
        impressions: m.views,
        profileVisits: m.profile_visits,
        follows: m.follows,
        watchTimeSec:
          typeof m.ig_reels_video_view_total_time === "number"
            ? m.ig_reels_video_view_total_time / 1000
            : undefined,
        avgWatchTimeSec:
          typeof m.ig_reels_avg_watch_time === "number" ? m.ig_reels_avg_watch_time / 1000 : undefined,
      } satisfies NormalizedPost;
    });

    if (batchMostlyFailed(insights)) {
      partialError = "Instagram media insights were mostly unavailable for this sync.";
    }
  } catch (e) {
    partialError = `Instagram media could not be fetched: ${(e as Error).message}`;
  }
  return { account, posts, partialError };
}

type InsightsResponse = { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };
function readInsights(resp: InsightsResponse): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of resp.data ?? []) {
    const v = row.values?.[0]?.value;
    if (typeof v === "number") out[row.name] = v;
  }
  return out;
}

// Instagram follower demographics (Business/Creator accounts with ≥100
// followers — Meta returns an error below that threshold, which callers treat
// as "no demographics yet" rather than a failure). Percentages of followers.
export async function fetchAudienceInstagram(igId: string, token: string): Promise<AudienceRow[]> {
  const out: AudienceRow[] = [];
  for (const breakdown of ["age", "gender", "country"] as const) {
    const resp = (await graph(
      `/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=${breakdown}`,
      token,
    )) as {
      data?: Array<{
        total_value?: { breakdowns?: Array<{ results?: Array<{ dimension_values?: string[]; value?: number }> }> };
      }>;
    };
    const results = resp.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    const total = results.reduce((s, r) => s + (r.value ?? 0), 0);
    if (total <= 0) continue;
    for (const r of results) {
      const bucket = r.dimension_values?.[0];
      if (!bucket) continue;
      out.push({ dimension: breakdown, bucket, value: ((r.value ?? 0) / total) * 100 });
    }
  }
  return out;
}

// Best-effort: revoke the app's permissions for this token.
export async function revoke(token: string): Promise<void> {
  await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => {});
}
