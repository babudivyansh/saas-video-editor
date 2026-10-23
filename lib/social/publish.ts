// Posting a video to a connected social account: the part shared by the web's
// clip publish route, the scheduler (lib/clip-scheduler.ts), the
// social-publish queue and the app's posts API (lib/mobile/posts.ts). See
// docs/mobile/SCHEDULING.md.
//
// Only YouTube is posted to automatically. Instagram and Facebook have no
// publishing code (lib/social/meta.ts has read scopes only; posting needs Meta
// App Review), so their posts become "your turn": the person posts it and
// links it back.

import { Readable } from "node:stream";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { notify, type NotificationType } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { parseS3Url } from "@/lib/s3-url";
import { NeedsReauthError, uploadVideo, type UploadBody } from "@/lib/social/google";
import { getValidAccessToken } from "@/lib/social/service";
import { openS3ObjectStream } from "@/utils/s3-upload";
import { FETCH_TIMEOUT } from "@/lib/fetch-timeout";

/** Providers we can post to without the person. */
export const AUTO_PUBLISH_PROVIDERS = new Set(["youtube"]);
/** Providers a post can target at all (auto or "your turn"). */
export const POSTABLE_PROVIDERS = new Set(["youtube", "instagram", "facebook"]);

/** The description when a post has no caption: what the web always sent. */
export const DEFAULT_DESCRIPTION = "Published via Clipiro AutoClip";

const PROVIDER_NAME: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", facebook: "Facebook" };
export const providerName = (p: string) => PROVIDER_NAME[p] ?? p;

/** Everything posting a row needs: its video, its account (with tokens). */
export const POST_INCLUDE = {
  clip: { select: { id: true, index: true, title: true, videoUrl: true, thumbnailUrl: true, status: true, durationSec: true, aspectRatio: true } },
  asset: { select: { id: true, name: true, s3Key: true, kind: true, status: true, duration: true, width: true, height: true, thumbnailS3Key: true } },
  socialAccount: true,
} satisfies Prisma.ClipPublishInclude;
export type PostRow = Prisma.ClipPublishGetPayload<{ include: typeof POST_INCLUDE }>;

/** Caption, then the hashtags; the old fixed line when both are empty. */
export function postDescription(caption: string | null, hashtags: string[]): string {
  const text = (caption ?? "").trim();
  const tags = hashtags.join(" ").trim();
  return [text, tags].filter(Boolean).join("\n\n") || DEFAULT_DESCRIPTION;
}

/** The title a post goes out with. */
export function postTitle(row: Pick<PostRow, "title" | "clip" | "asset">): string {
  if (row.title?.trim()) return row.title.trim();
  if (row.clip) return row.clip.title || `Clip ${row.clip.index + 1}`;
  if (row.asset) return row.asset.name.replace(/\.[a-z0-9]{2,4}$/i, "");
  return "Video";
}

/**
 * Where the post's video is: an S3 key (streamed), a plain URL, "not yet"
 * (a clip still rendering) or "gone".
 */
export function videoOf(row: Pick<PostRow, "clip" | "asset">): { key: string } | { url: string } | { wait: true } | { gone: true } {
  if (row.clip) {
    if (row.clip.status !== "ready" || !row.clip.videoUrl) return row.clip.status === "failed" ? { gone: true } : { wait: true };
    const loc = parseS3Url(row.clip.videoUrl);
    return loc ? { key: loc.key } : { url: row.clip.videoUrl };
  }
  if (row.asset && row.asset.kind === "video") {
    if (row.asset.status === "processing") return { wait: true };
    return row.asset.status === "ready" ? { key: row.asset.s3Key } : { gone: true };
  }
  return { gone: true };
}

async function openVideo(src: { key: string } | { url: string }): Promise<UploadBody> {
  if ("key" in src) return openS3ObjectStream(src.key);
  // Only our own stored URLs reach here (a clip's videoUrl outside S3, e.g. local dev).
  const res = await fetch(src.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT.transfer) });
  if (!res.ok || !res.body) throw new Error(`video download failed: ${res.status}`);
  const len = Number(res.headers.get("content-length"));
  if (len > 0) return { stream: Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), size: len };
  return { buffer: Buffer.from(await res.arrayBuffer()) };
}

/** Uploads a row's video to YouTube, streamed from storage. Throws NeedsReauthError when the account lacks the upload scope. */
export async function uploadPost(row: PostRow): Promise<{ videoId: string; permalink: string }> {
  const src = videoOf(row);
  if (!("key" in src) && !("url" in src)) throw new Error("the video isn't available");
  const accessToken = await getValidAccessToken(row.socialAccount);
  const body = await openVideo(src);
  const privacy = row.privacy === "unlisted" || row.privacy === "private" ? row.privacy : "public";
  return uploadVideo(accessToken, { ...body, title: postTitle(row), description: postDescription(row.caption, row.hashtags), privacyStatus: privacy });
}

// ── Quota guard (D5) ─────────────────────────────────────────────────────────
// A YouTube upload costs 1,600 of the project's 10,000 daily units, so the
// whole app gets about 6 a day until Google raises the quota. The counter is
// per Pacific day, which is when YouTube resets it.

const DEFAULT_DAILY_UPLOADS = 6;
const DEFAULT_USER_DAILY_POSTS = 10;
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : d);
export const dailyUploadCap = () => num(env.SOCIAL_YOUTUBE_DAILY_UPLOADS, DEFAULT_DAILY_UPLOADS);
export const userDailyPostCap = () => num(env.SOCIAL_POSTS_PER_USER_DAY, DEFAULT_USER_DAILY_POSTS);

const pacificDay = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const slotKey = () => `social:yt-uploads:${pacificDay()}`;

/** Takes one of today's app-wide YouTube uploads; false when they're used up. */
export async function takeUploadSlot(): Promise<boolean> {
  const used = await redis.incrWithExpire(slotKey(), 2 * 86_400);
  if (used <= dailyUploadCap()) return true;
  await redis.decrFloor(slotKey());
  return false;
}

/** Whether today's uploads are already used up (for warning before scheduling "now"). */
export async function uploadsFullToday(): Promise<boolean> {
  return Number((await redis.get(slotKey())) ?? 0) >= dailyUploadCap();
}

/** Posts this person created in the last 24 h (each account a post goes to counts). */
export async function postsInLastDay(userId: string): Promise<number> {
  return prisma.clipPublish.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
}

// ── Telling the person ───────────────────────────────────────────────────────

/** The web link a post notification carries; the app maps it to the post (lib/mobile/notifications.ts). */
export const postHref = (id: string) => `/dashboard/social-tracker?post=${encodeURIComponent(id)}`;

export async function notifyPost(row: Pick<PostRow, "id" | "userId" | "title" | "clip" | "asset" | "socialAccount">, type: Extract<NotificationType, `social_post_${string}`>, reason?: string): Promise<void> {
  const name = providerName(row.socialAccount.provider);
  const title = postTitle(row);
  const copy: Record<typeof type, { title: string; body: string }> = {
    social_post_published: { title: `Posted to ${name}`, body: `“${title}” is live.` },
    social_post_failed: { title: `A post to ${name} didn’t go out`, body: reason ?? `“${title}” wasn’t posted.` },
    social_post_needs_reconnect: { title: `Reconnect ${name} to post`, body: `“${title}” is waiting. Reconnect the account, then retry the post.` },
    social_post_your_turn: { title: `Time to post on ${name}`, body: `“${title}” is ready. Open Clipiro to post it, then add the link.` },
  };
  await notify({ userId: row.userId, type, ...copy[type], href: postHref(row.id), metadata: { postId: row.id } });
}

async function fail(row: PostRow, reason: string, type: "social_post_failed" | "social_post_needs_reconnect" = "social_post_failed") {
  await prisma.clipPublish.update({ where: { id: row.id }, data: { status: "failed", failureReason: reason } }).catch(() => {});
  await notifyPost(row, type, reason);
}

/** A due Instagram/Facebook post: the person's turn to post it. */
export async function remindManual(row: PostRow): Promise<boolean> {
  const moved = await prisma.clipPublish.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "awaiting_manual" } });
  if (moved.count === 0) return false;
  await notifyPost(row, "social_post_your_turn");
  return true;
}

export type RunOutcome = "published" | "failed" | "skipped" | "busy" | "reminded";

/**
 * Posts one due row: checks it can go, takes a quota slot, claims it
 * (pending → publishing, so two workers can't both upload it), uploads, and
 * tells the person how it went. Never throws.
 */
export async function runPost(id: string): Promise<RunOutcome> {
  const row = await prisma.clipPublish.findUnique({ where: { id }, include: POST_INCLUDE });
  if (!row || row.status !== "pending") return "skipped";
  if (!AUTO_PUBLISH_PROVIDERS.has(row.socialAccount.provider)) return (await remindManual(row)) ? "reminded" : "skipped";

  const src = videoOf(row);
  if ("wait" in src) return "skipped"; // still rendering; the lateness window decides when to give up
  if ("gone" in src) {
    await fail(row, "The video was deleted or didn’t finish, so there was nothing to post.");
    return "failed";
  }
  if (row.socialAccount.status !== "active") {
    await fail(row, `Reconnect your ${providerName(row.socialAccount.provider)} account, then retry this post.`, "social_post_needs_reconnect");
    return "failed";
  }
  if (!(await takeUploadSlot())) return "busy"; // stays pending; the next tick (or tomorrow) tries again

  const claimed = await prisma.clipPublish.updateMany({ where: { id: row.id, status: "pending" }, data: { status: "publishing" } });
  if (claimed.count === 0) {
    await redis.decrFloor(slotKey());
    return "skipped";
  }

  try {
    const uploaded = await uploadPost(row);
    await prisma.clipPublish.update({
      where: { id: row.id },
      data: { status: "linked", providerPostId: uploaded.videoId, permalink: uploaded.permalink, publishedAt: new Date(), failureReason: null },
    });
    await notifyPost(row, "social_post_published");
    return "published";
  } catch (err) {
    if (err instanceof NeedsReauthError) {
      await prisma.socialAccount.update({ where: { id: row.socialAccountId }, data: { status: "needs_reauth" } }).catch(() => {});
      await fail(row, `Reconnect your ${providerName(row.socialAccount.provider)} account to allow uploads, then retry this post.`, "social_post_needs_reconnect");
    } else {
      logger.error("social-publish", `post ${row.id} failed`, err);
      await fail(row, "We couldn’t post this video. Retry it, or post it yourself.");
    }
    return "failed";
  }
}
