import { redirectUri } from "./oauth";
import type { NormalizedAccount, NormalizedPost, OAuthTokens, ProviderId, ProviderSync } from "./types";

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
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID is not configured");
  return id;
}
function appSecret() {
  const s = process.env.META_APP_SECRET;
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
  if (!shortRes.ok) throw new Error(`meta token exchange failed: ${shortRes.status} ${await shortRes.text()}`);
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
  if (!res.ok) throw new Error(`meta /me/accounts failed: ${res.status} ${await res.text()}`);
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
  if (!res.ok) throw new Error(`meta graph ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Re-fetch one account's profile + recent posts/media with analytics.
export async function syncAccount(
  providerAccountId: string,
  provider: Extract<ProviderId, "facebook" | "instagram">,
  pageToken: string,
): Promise<ProviderSync> {
  return provider === "facebook"
    ? syncFacebook(providerAccountId, pageToken)
    : syncInstagram(providerAccountId, pageToken);
}

async function syncFacebook(pageId: string, token: string): Promise<ProviderSync> {
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
  try {
    const feed = (await graph(
      `/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=15`,
      token,
    )) as { data?: Array<{ id: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string }> };
    posts = await Promise.all(
      (feed.data ?? []).map(async (post) => {
        const insights = await graph(`/${post.id}/insights?metric=post_impressions,post_engaged_users`, token).catch(
          () => ({}),
        );
        const m = readInsights(insights as InsightsResponse);
        return {
          providerPostId: post.id,
          caption: post.message,
          thumbnailUrl: post.full_picture,
          permalink: post.permalink_url,
          mediaType: "post",
          publishedAt: post.created_time ? new Date(post.created_time) : undefined,
          reach: m.post_impressions,
          likes: m.post_engaged_users,
        } satisfies NormalizedPost;
      }),
    );
  } catch {
    /* posts/insights are best-effort */
  }
  return { account, posts };
}

async function syncInstagram(igId: string, token: string): Promise<ProviderSync> {
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
  try {
    const media = (await graph(
      `/${igId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count&limit=20`,
      token,
    )) as {
      data?: Array<{
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
      }>;
    };
    posts = await Promise.all(
      (media.data ?? []).map(async (item) => {
        const insights = await graph(`/${item.id}/insights?metric=reach,saved`, token).catch(() => ({}));
        const m = readInsights(insights as InsightsResponse);
        return {
          providerPostId: item.id,
          caption: item.caption,
          thumbnailUrl: item.thumbnail_url || item.media_url,
          permalink: item.permalink,
          mediaType: (item.media_product_type || item.media_type || "").toLowerCase() === "reels" ? "reel" : item.media_type?.toLowerCase(),
          publishedAt: item.timestamp ? new Date(item.timestamp) : undefined,
          likes: item.like_count,
          comments: item.comments_count,
          reach: m.reach,
          saves: m.saved,
        } satisfies NormalizedPost;
      }),
    );
  } catch {
    /* media/insights are best-effort */
  }
  return { account, posts };
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

// Best-effort: revoke the app's permissions for this token.
export async function revoke(token: string): Promise<void> {
  await fetch(`${GRAPH}/me/permissions?access_token=${encodeURIComponent(token)}`, { method: "DELETE" }).catch(() => {});
}
