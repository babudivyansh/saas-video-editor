import { redirectUri } from "./oauth";
import { ProviderApiError } from "./errors";
import type { NormalizedAccount, NormalizedPost, OAuthTokens, ProviderSync, SyncOptions } from "./types";
import { env } from "@/lib/env";

// TikTok via the Display API (v2) for read access, plus the Content Posting
// API for publish (P2.5-equivalent to YouTube's uploadVideo below). Access
// tokens live ~24h; refresh tokens ~365d and ROTATE on every refresh — always
// persist the returned refresh_token.
//
// Requires an approved TikTok developer app (developers.tiktok.com); the
// connect card is hidden until TIKTOK_CLIENT_KEY/SECRET are configured.
//
// video.publish is a sensitive scope, same situation as YouTube's
// youtube.upload: TikTok must approve this app for Content Posting API
// access before the scope grant does anything, and until that approval an
// unaudited app can only post as SELF_ONLY (private to the poster) — see
// uploadVideo's privacy_level below. Accounts connected before this scope
// existed cannot publish until reconnected (same reasoning as YouTube's
// NeedsReauthError).
const AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";

const SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.publish"];

export function isConfigured(): boolean {
  return !!env.TIKTOK_CLIENT_KEY && !!env.TIKTOK_CLIENT_SECRET;
}

function clientKey() {
  const k = env.TIKTOK_CLIENT_KEY;
  if (!k) throw new Error("TIKTOK_CLIENT_KEY is not configured");
  return k;
}
function clientSecret() {
  const s = env.TIKTOK_CLIENT_SECRET;
  if (!s) throw new Error("TIKTOK_CLIENT_SECRET is not configured");
  return s;
}

export function getAuthUrl(state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_key: clientKey(),
    redirect_uri: redirectUri("tiktok"),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH}?${p.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  open_id: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<OAuthTokens & { openId: string }> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new ProviderApiError(`tiktok token request failed: ${res.status}`, res.status, text);
  const j = JSON.parse(text) as TokenResponse;
  // TikTok reports some failures as 200 + error body.
  if (j.error || !j.access_token) {
    throw new ProviderApiError(`tiktok token request failed: ${j.error ?? "no access_token"}`, 401, text);
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : undefined,
    scopes: SCOPES,
    openId: j.open_id,
  };
}

export function exchangeCode(code: string, verifier: string): Promise<OAuthTokens & { openId: string }> {
  return tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri("tiktok"),
    code_verifier: verifier,
  });
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export async function revoke(token: string): Promise<void> {
  await fetch(`${API}/oauth/revoke/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: clientKey(), client_secret: clientSecret(), token }),
  }).catch(() => {});
}

async function api(path: string, accessToken: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new ProviderApiError(`tiktok api ${path} failed: ${res.status}`, res.status, await res.text());
  return res.json();
}

const BACKFILL_POSTS = 100;
const STEADY_POSTS = 20;

export async function sync(accessToken: string, opts?: SyncOptions): Promise<ProviderSync> {
  const fields = "open_id,union_id,avatar_url,display_name,username,follower_count,likes_count,video_count";
  const info = (await api(`/user/info/?fields=${fields}`, accessToken)) as {
    data?: {
      user?: {
        open_id?: string;
        avatar_url?: string;
        display_name?: string;
        username?: string;
        follower_count?: number;
        likes_count?: number;
      };
    };
  };
  const u = info.data?.user;
  if (!u?.open_id) throw new Error("no TikTok user for this token");

  const account: NormalizedAccount = {
    provider: "tiktok",
    providerAccountId: u.open_id,
    username: u.username,
    displayName: u.display_name || u.username,
    avatarUrl: u.avatar_url,
    metrics: { followers: u.follower_count, engagement: u.likes_count },
  };

  const posts: NormalizedPost[] = [];
  let partialError: string | undefined;
  try {
    const max = opts?.backfill ? BACKFILL_POSTS : STEADY_POSTS;
    const videoFields = "id,title,cover_image_url,share_url,view_count,like_count,comment_count,share_count,create_time";
    let cursor: number | undefined;
    let hasMore = true;
    while (hasMore && posts.length < max) {
      const page = (await api(`/video/list/?fields=${videoFields}`, accessToken, {
        method: "POST",
        body: JSON.stringify({ max_count: Math.min(20, max - posts.length), ...(cursor ? { cursor } : {}) }),
      })) as {
        data?: {
          videos?: Array<{
            id: string;
            title?: string;
            cover_image_url?: string;
            share_url?: string;
            view_count?: number;
            like_count?: number;
            comment_count?: number;
            share_count?: number;
            create_time?: number;
          }>;
          cursor?: number;
          has_more?: boolean;
        };
      };
      posts.push(
        ...(page.data?.videos ?? []).map((v) => ({
          providerPostId: v.id,
          caption: v.title,
          thumbnailUrl: v.cover_image_url,
          permalink: v.share_url,
          mediaType: "video",
          publishedAt: v.create_time ? new Date(v.create_time * 1000) : undefined,
          views: v.view_count,
          likes: v.like_count,
          comments: v.comment_count,
          shares: v.share_count,
        })),
      );
      cursor = page.data?.cursor;
      hasMore = !!page.data?.has_more && !!cursor;
    }
  } catch (e) {
    partialError = `TikTok videos could not be fetched: ${(e as Error).message}`;
  }
  return { account, posts, partialError };
}

export class TikTokNeedsReauthError extends Error {
  constructor() { super("This TikTok account was connected before publish access existed — reconnect it to enable publishing."); }
}

/**
 * UNVERIFIED — implemented from TikTok's published Content Posting API docs
 * (v2, "Direct Post" via FILE_UPLOAD source), not tested against a real
 * TikTok developer app or a live upload, since this codebase has no TikTok
 * app credentials to test with. Confirm all of the following before relying
 * on this in production:
 *   - Exact request/response field names against
 *     https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 *     — TikTok's API has changed shape between versions before.
 *   - Unaudited apps can only post with privacy_level "SELF_ONLY" (visible
 *     only to the poster) until TikTok approves this app for public
 *     posting — hardcoded to that safest option below; a real integration
 *     needs to read the app's actual approved privacy options from TikTok's
 *     /post/publish/creator_info/query/ endpoint instead of assuming.
 *   - Whether chunked upload is required. TikTok requires chunking above a
 *     size threshold; this sends AutoClip's typically-short/small clips as
 *     one chunk, which may not hold for longer/larger renders.
 *   - Publish is asynchronous: TikTok accepts the upload here and processes
 *     it separately. This function returns once the upload is accepted, NOT
 *     once the post is actually live — there is no permalink at this point
 *     (unlike YouTube's uploadVideo). A real integration needs to poll
 *     /post/publish/status/fetch/ with the returned publishId to learn the
 *     final status and permalink, which isn't implemented here.
 */
export async function uploadVideo(
  accessToken: string,
  params: { buffer: Buffer; title: string },
): Promise<{ publishId: string }> {
  const initRes = await fetch(`${API}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: params.title.slice(0, 150),
        privacy_level: "SELF_ONLY",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: params.buffer.length,
        chunk_size: params.buffer.length,
        total_chunk_count: 1,
      },
    }),
  });

  if (initRes.status === 401 || initRes.status === 403) throw new TikTokNeedsReauthError();
  if (!initRes.ok) throw new Error(`tiktok publish init failed: ${initRes.status} ${await initRes.text()}`);

  const init = (await initRes.json()) as { data?: { publish_id?: string; upload_url?: string }; error?: { code?: string; message?: string } };
  const publishId = init.data?.publish_id;
  const uploadUrl = init.data?.upload_url;
  if (!publishId || !uploadUrl) {
    throw new Error(`tiktok publish init returned no upload URL: ${JSON.stringify(init.error ?? init)}`);
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${params.buffer.length - 1}/${params.buffer.length}`,
    },
    body: new Uint8Array(params.buffer),
  });
  if (!putRes.ok) throw new Error(`tiktok video upload failed: ${putRes.status} ${await putRes.text()}`);

  return { publishId };
}
