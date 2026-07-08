import { redirectUri } from "./oauth";
import type { NormalizedAccount, NormalizedPost, OAuthTokens, ProviderSync } from "./types";
import { env } from "@/lib/env";

// YouTube via Google OAuth. Read-only scopes only:
//   youtube.readonly       — channel + uploads + public video statistics
//   yt-analytics.readonly  — per-video watch time (estimatedMinutesWatched)
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";
const ANALYTICS = "https://youtubeanalytics.googleapis.com/v2/reports";

function clientId() {
  const id = env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not configured");
  return id;
}
function clientSecret() {
  const s = env.GOOGLE_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_CLIENT_SECRET is not configured");
  return s;
}

export function getAuthUrl(state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri("youtube"),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // request a refresh token
    prompt: "consent", // force refresh-token issuance on re-consent
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH}?${p.toString()}`;
}

function toTokens(j: Record<string, unknown>, fallbackRefresh?: string): OAuthTokens {
  const expiresIn = Number(j.expires_in ?? 0);
  return {
    accessToken: String(j.access_token),
    refreshToken: (j.refresh_token as string) || fallbackRefresh,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
    scopes: typeof j.scope === "string" ? j.scope.split(" ") : SCOPES,
  };
}

export async function exchangeCode(code: string, verifier: string): Promise<OAuthTokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri("youtube"),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status} ${await res.text()}`);
  return toTokens(await res.json());
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`google token refresh failed: ${res.status}`);
  return toTokens(await res.json(), refreshToken);
}

export async function revoke(token: string): Promise<void> {
  await fetch(`${REVOKE}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

async function api(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`youtube api ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Pull watch-time per video from the Analytics API (last 90 days). Non-fatal —
// returns an empty map if the call is unavailable.
async function fetchWatchTime(accessToken: string, videoIds: string[]): Promise<Record<string, number>> {
  if (videoIds.length === 0) return {};
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const p = new URLSearchParams({
    ids: "channel==MINE",
    startDate: start,
    endDate: end,
    metrics: "estimatedMinutesWatched,views",
    dimensions: "video",
    filters: `video==${videoIds.join(",")}`,
    maxResults: "200",
  });
  try {
    const res = await fetch(`${ANALYTICS}?${p.toString()}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return {};
    const j = (await res.json()) as { rows?: [string, number, number][] };
    const map: Record<string, number> = {};
    for (const row of j.rows ?? []) map[row[0]] = Number(row[1]) * 60; // minutes -> seconds
    return map;
  } catch {
    return {};
  }
}

// Fetch the authenticated user's channel + recent uploads with analytics.
export async function sync(accessToken: string): Promise<ProviderSync> {
  const ch = (await api("/channels?part=snippet,statistics,contentDetails&mine=true", accessToken)) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
      statistics?: { subscriberCount?: string; viewCount?: string };
      contentDetails?: { relatedPlaylists?: { uploads?: string } };
    }>;
  };
  const channel = ch.items?.[0];
  if (!channel) throw new Error("no YouTube channel for this account");

  const account: NormalizedAccount = {
    provider: "youtube",
    providerAccountId: channel.id,
    username: channel.snippet?.customUrl,
    displayName: channel.snippet?.title,
    avatarUrl: channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.default?.url,
    metrics: {
      followers: Number(channel.statistics?.subscriberCount ?? 0),
      views: Number(channel.statistics?.viewCount ?? 0),
    },
  };

  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  let posts: NormalizedPost[] = [];
  if (uploads) {
    const pl = (await api(`/playlistItems?part=contentDetails&maxResults=20&playlistId=${uploads}`, accessToken)) as {
      items?: Array<{ contentDetails?: { videoId?: string } }>;
    };
    const ids = (pl.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => !!v);
    if (ids.length > 0) {
      const [vids, watch] = await Promise.all([
        api(`/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}`, accessToken) as Promise<{
          items?: Array<{
            id: string;
            snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
            statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
            contentDetails?: { duration?: string };
          }>;
        }>,
        fetchWatchTime(accessToken, ids),
      ]);
      posts = (vids.items ?? []).map((v) => ({
        providerPostId: v.id,
        caption: v.snippet?.title,
        thumbnailUrl: v.snippet?.thumbnails?.medium?.url,
        permalink: `https://www.youtube.com/watch?v=${v.id}`,
        mediaType: isShort(v.contentDetails?.duration) ? "short" : "video",
        publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : undefined,
        views: Number(v.statistics?.viewCount ?? 0),
        likes: Number(v.statistics?.likeCount ?? 0),
        comments: Number(v.statistics?.commentCount ?? 0),
        watchTimeSec: watch[v.id],
      }));
    }
  }

  return { account, posts };
}

// ISO-8601 duration <= 60s (PT#M#S / PT#S) → treat as a Short.
function isShort(iso?: string): boolean {
  if (!iso) return false;
  const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return false;
  const secs = (Number(m[1] ?? 0)) * 60 + Number(m[2] ?? 0);
  return secs > 0 && secs <= 60 && !iso.includes("H");
}
