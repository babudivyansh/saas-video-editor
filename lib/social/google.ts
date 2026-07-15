import { redirectUri } from "./oauth";
import { ProviderApiError } from "./errors";
import type { NormalizedAccount, NormalizedPost, OAuthTokens, ProviderSync, SyncOptions } from "./types";
import { env } from "@/lib/env";

// YouTube via Google OAuth.
//   youtube.readonly       — channel + uploads + public video statistics
//   yt-analytics.readonly  — per-video watch time (estimatedMinutesWatched)
//   youtube.upload         — publish AutoClip clips directly (P2.5). A
//                            sensitive scope: Google may show an
//                            "unverified app" warning on new connects until
//                            this Google Cloud project completes OAuth
//                            verification for it — that's a Google Cloud
//                            Console step outside this codebase's control.
//                            Accounts connected before this scope existed
//                            cannot publish until the user reconnects
//                            (refreshing a token never adds scope it wasn't
//                            originally granted) — see uploadVideo's
//                            needsReauth handling.
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
];

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const REVOKE = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3/videos";
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
  if (!res.ok) throw new ProviderApiError(`google token exchange failed: ${res.status}`, res.status, await res.text());
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
  if (!res.ok) throw new ProviderApiError(`google token refresh failed: ${res.status}`, res.status, await res.text());
  return toTokens(await res.json(), refreshToken);
}

export async function revoke(token: string): Promise<void> {
  await fetch(`${REVOKE}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

async function api(path: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new ProviderApiError(`youtube api ${path} failed: ${res.status}`, res.status, await res.text());
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

// First sync pulls deeper history so charts start meaningful; steady-state
// syncs only need the newest page (uploads come back newest-first, so a
// 20-item page always covers everything since the last 12h-ish sync).
const BACKFILL_POSTS = 100;
const STEADY_POSTS = 20;

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

// Fetch the authenticated user's channel + recent uploads with analytics.
export async function sync(accessToken: string, opts?: SyncOptions): Promise<ProviderSync> {
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
    const wanted = opts?.backfill ? BACKFILL_POSTS : STEADY_POSTS;
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const pl = (await api(
        `/playlistItems?part=contentDetails&maxResults=${Math.min(50, wanted - ids.length)}&playlistId=${uploads}` +
          (pageToken ? `&pageToken=${pageToken}` : ""),
        accessToken,
      )) as { items?: Array<{ contentDetails?: { videoId?: string } }>; nextPageToken?: string };
      ids.push(...(pl.items ?? []).map((i) => i.contentDetails?.videoId).filter((v): v is string => !!v));
      pageToken = pl.nextPageToken;
    } while (pageToken && ids.length < wanted);

    // /videos and the Analytics filter both cap at 50 ids per call.
    for (const batch of chunks(ids, 50)) {
      const [vids, watch] = await Promise.all([
        api(`/videos?part=snippet,statistics,contentDetails&id=${batch.join(",")}`, accessToken) as Promise<{
          items?: Array<{
            id: string;
            snippet?: { title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } } };
            statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
            contentDetails?: { duration?: string };
          }>;
        }>,
        fetchWatchTime(accessToken, batch),
      ]);
      posts.push(
        ...(vids.items ?? []).map((v) => ({
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
        })),
      );
    }
  }

  return { account, posts };
}

export class NeedsReauthError extends Error {
  constructor() { super("This YouTube account was connected before publish access existed — reconnect it to enable publishing."); }
}

// Publishes a rendered clip to YouTube (Shorts, since AutoClip output is
// vertical) via the resumable-upload protocol. Single-shot PUT rather than
// chunked — AutoClip clips are short/small enough (seconds, low-res) that
// this is well within what a single request handles; chunking only matters
// for large long-form uploads.
export async function uploadVideo(
  accessToken: string,
  params: { buffer: Buffer; title: string; description?: string; privacyStatus?: "public" | "unlisted" | "private" },
): Promise<{ videoId: string; permalink: string }> {
  const initRes = await fetch(`${UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(params.buffer.length),
    },
    body: JSON.stringify({
      snippet: { title: params.title.slice(0, 100), description: params.description?.slice(0, 5000) ?? "" },
      status: { privacyStatus: params.privacyStatus ?? "unlisted", selfDeclaredMadeForKids: false },
    }),
  });

  if (initRes.status === 401 || initRes.status === 403) {
    const body = await initRes.text();
    if (/insufficient|scope/i.test(body)) throw new NeedsReauthError();
    throw new Error(`youtube upload init failed: ${initRes.status} ${body}`);
  }
  if (!initRes.ok) throw new Error(`youtube upload init failed: ${initRes.status} ${await initRes.text()}`);

  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("youtube upload init returned no upload URL");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(params.buffer.length) },
    body: new Uint8Array(params.buffer),
  });
  if (!putRes.ok) throw new Error(`youtube upload failed: ${putRes.status} ${await putRes.text()}`);

  const video = (await putRes.json()) as { id: string };
  return { videoId: video.id, permalink: `https://www.youtube.com/watch?v=${video.id}` };
}

// ISO-8601 duration <= 60s (PT#M#S / PT#S) → treat as a Short.
function isShort(iso?: string): boolean {
  if (!iso) return false;
  const m = iso.match(/PT(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return false;
  const secs = (Number(m[1] ?? 0)) * 60 + Number(m[2] ?? 0);
  return secs > 0 && secs <= 60 && !iso.includes("H");
}
