import type { Prisma } from "@prisma/client";
import {
  CAPTION_MAX,
  POST_MAX_DAYS,
  POST_MIN_LEAD_MIN,
  POST_STATUSES,
  type CreatePostsRequest,
  type PostStatus,
  type SocialPost,
  type UpdatePostRequest,
} from "@clipiro/shared";
import { resolveProviderPostId } from "@/lib/autoclip-publish";
import { mobileError } from "@/lib/mobile/http";
import { prisma } from "@/lib/prisma";
import { resignMediaUrl } from "@/lib/signed-media";
import { enqueuePost } from "@/lib/social/publish-queue";
import {
  AUTO_PUBLISH_PROVIDERS,
  POST_INCLUDE,
  POSTABLE_PROVIDERS,
  postsInLastDay,
  postTitle,
  providerName,
  uploadsFullToday,
  userDailyPostCap,
  type PostRow,
} from "@/lib/social/publish";
import { getAssetReadUrl } from "@/utils/s3-upload";

// The Social Studio's posts for /api/mobile/v1/social/posts
// (docs/mobile/SCHEDULING.md §3.2). A post is a ClipPublish row: one video to
// one account. Posting itself is lib/social/publish.ts; this is the person's
// side of it — list, create, change, cancel, retry, and "I posted it".

const MIN = 60_000;
const DAY = 86_400_000;
/** A Short: vertical and at most 3 minutes (YouTube decides; this only warns). */
const SHORT_MAX_SEC = 180;

export class PostError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** A PostError as the mobile error answer; anything else is rethrown. */
export function postErrorResponse(e: unknown) {
  if (e instanceof PostError) return mobileError(e.status, e.message, e.code ? { code: e.code } : {});
  throw e;
}

const isAuto = (row: Pick<PostRow, "socialAccount">) => AUTO_PUBLISH_PROVIDERS.has(row.socialAccount.provider);

/** The app's status for a row (SCHEDULING.md §3.1). */
export function postStatus(row: Pick<PostRow, "status" | "scheduledFor" | "socialAccount">, now = new Date()): PostStatus {
  switch (row.status) {
    case "linked":
      return "posted";
    case "failed":
      return "failed";
    case "expired":
      return "missed";
    case "awaiting_manual":
      return "your_turn";
    case "publishing":
      return "posting";
    default: // pending
      if (row.scheduledFor && row.scheduledFor > now) return "scheduled";
      return isAuto(row) ? "posting" : "your_turn";
  }
}

async function thumbnailOf(row: PostRow): Promise<string | null> {
  if (row.clip?.thumbnailUrl) return resignMediaUrl(row.clip.thumbnailUrl);
  if (row.asset?.thumbnailS3Key) return getAssetReadUrl(row.asset.thumbnailS3Key).catch(() => null);
  return null;
}

export async function toPost(row: PostRow, now = new Date()): Promise<SocialPost> {
  const status = postStatus(row, now);
  const a = row.socialAccount;
  return {
    id: row.id,
    clipId: row.clipId,
    assetId: row.assetId,
    title: postTitle(row),
    thumbnailUrl: await thumbnailOf(row),
    account: { id: a.id, provider: a.provider as SocialPost["account"]["provider"], name: a.displayName ?? a.username ?? providerName(a.provider) },
    caption: row.caption ?? "",
    hashtags: row.hashtags,
    privacy: (["public", "unlisted", "private"] as const).find((p) => p === row.privacy) ?? "public",
    status,
    scheduledAt: row.scheduledFor?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    permalink: row.permalink,
    failureReason: status === "failed" || status === "missed" ? row.failureReason : null,
    editable: status === "scheduled",
  };
}

// ── List ─────────────────────────────────────────────────────────────────────

const statusWhere = (s: PostStatus, now: Date): Prisma.ClipPublishWhereInput => {
  const auto = { socialAccount: { provider: { in: [...AUTO_PUBLISH_PROVIDERS] } } };
  const manual = { socialAccount: { provider: { notIn: [...AUTO_PUBLISH_PROVIDERS] } } };
  const due = { OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }] };
  switch (s) {
    case "scheduled":
      return { status: "pending", scheduledFor: { gt: now } };
    case "posting":
      return { OR: [{ status: "publishing" }, { status: "pending", ...due, ...auto }] };
    case "posted":
      return { status: "linked" };
    case "failed":
      return { status: "failed" };
    case "missed":
      return { status: "expired" };
    case "your_turn":
      return { OR: [{ status: "awaiting_manual" }, { status: "pending", ...due, ...manual }] };
  }
};

export interface ListQuery {
  from?: string | null;
  to?: string | null;
  status?: string | null;
  cursor?: string | null;
  limit?: number;
}

const parseDate = (v: string | null | undefined) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * The person's posts with their time (or, never scheduled, their creation) in
 * [from, to], earliest first. Defaults: 30 days back to 90 ahead.
 */
export async function listPosts(userId: string, q: ListQuery): Promise<{ posts: SocialPost[]; nextCursor: string | null }> {
  const now = new Date();
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  if (from === undefined || to === undefined) throw new PostError(400, "from and to must be dates", "invalid_request");
  if (q.status && !(POST_STATUSES as readonly string[]).includes(q.status)) throw new PostError(400, "Unknown status", "invalid_request");
  const range = { gte: from ?? new Date(now.getTime() - 30 * DAY), lte: to ?? new Date(now.getTime() + POST_MAX_DAYS * DAY) };
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 200);

  const rows = await prisma.clipPublish.findMany({
    where: {
      userId,
      socialAccount: { userId, provider: { in: [...POSTABLE_PROVIDERS] } },
      AND: [
        { OR: [{ scheduledFor: range }, { scheduledFor: null, createdAt: range }] },
        ...(q.status ? [statusWhere(q.status as PostStatus, now)] : []),
      ],
    },
    include: POST_INCLUDE,
    orderBy: [{ scheduledFor: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, limit);
  return { posts: await Promise.all(page.map((r) => toPost(r, now))), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
}

export async function getPost(userId: string, id: string): Promise<PostRow> {
  const row = await prisma.clipPublish.findFirst({ where: { id, userId }, include: POST_INCLUDE });
  if (!row) throw new PostError(404, "That post isn’t here any more.", "not_found");
  return row;
}

// ── Create ───────────────────────────────────────────────────────────────────

/** The scheduled time, checked: at least POST_MIN_LEAD_MIN ahead, at most POST_MAX_DAYS. */
function checkTime(iso: string, now: Date): Date {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) throw new PostError(400, "Pick a time", "invalid_time");
  if (at.getTime() < now.getTime() + POST_MIN_LEAD_MIN * MIN) throw new PostError(400, `Pick a time at least ${POST_MIN_LEAD_MIN} minutes from now`, "invalid_time");
  if (at.getTime() > now.getTime() + POST_MAX_DAYS * DAY) throw new PostError(400, `Pick a time within ${POST_MAX_DAYS} days`, "invalid_time");
  return at;
}

function checkCaption(caption: string, providers: string[]) {
  const meta = providers.find((p) => !AUTO_PUBLISH_PROVIDERS.has(p));
  if (meta && caption.length > CAPTION_MAX) {
    throw new PostError(400, `${providerName(meta)} captions stop at ${CAPTION_MAX.toLocaleString("en-US")} characters`, "caption_too_long");
  }
}

interface Video {
  clipId: string | null;
  assetId: string | null;
  isShort: boolean;
}

async function ownedVideo(userId: string, source: CreatePostsRequest["source"]): Promise<Video> {
  if ("clipId" in source) {
    const clip = await prisma.clip.findFirst({
      where: { id: source.clipId, project: { userId } },
      select: { id: true, status: true, videoUrl: true, durationSec: true, aspectRatio: true },
    });
    if (!clip) throw new PostError(404, "That clip isn’t here any more.", "not_found");
    if (clip.status !== "ready" || !clip.videoUrl) throw new PostError(409, "This clip hasn’t finished rendering yet.", "not_ready");
    return { clipId: clip.id, assetId: null, isShort: clip.durationSec <= SHORT_MAX_SEC && clip.aspectRatio === "9:16" };
  }
  const asset = await prisma.asset.findFirst({
    where: { id: source.assetId, userId },
    select: { id: true, kind: true, status: true, duration: true, width: true, height: true },
  });
  if (!asset) throw new PostError(404, "That video isn’t in your Assets any more.", "not_found");
  if (asset.kind !== "video") throw new PostError(400, "Only videos can be posted.", "wrong_kind");
  if (asset.status !== "ready") throw new PostError(409, "This video is still being processed.", "not_ready");
  const vertical = asset.width != null && asset.height != null && asset.height > asset.width;
  return { clipId: null, assetId: asset.id, isShort: vertical && (asset.duration ?? Infinity) <= SHORT_MAX_SEC };
}

/**
 * One post per chosen account. YouTube: "now" goes on the social-publish
 * queue (the cron is the fallback); a time is left for the cron. Instagram /
 * Facebook: "now" is the person's turn straight away; a time becomes their
 * turn (with a push) when it comes.
 */
export async function createPosts(userId: string, body: CreatePostsRequest & { privacy: SocialPost["privacy"]; caption: string; hashtags: string[] }) {
  const now = new Date();
  const ids = [...new Set(body.accountIds)];
  const accounts = await prisma.socialAccount.findMany({ where: { id: { in: ids }, userId } });
  if (accounts.length !== ids.length) throw new PostError(404, "One of those accounts isn’t connected any more.", "not_found");
  const unpostable = accounts.find((a) => !POSTABLE_PROVIDERS.has(a.provider));
  if (unpostable) throw new PostError(400, `Posting to ${providerName(unpostable.provider)} isn’t supported.`, "unsupported_provider");
  const stale = accounts.find((a) => a.status !== "active");
  if (stale) throw new PostError(409, `Reconnect ${providerName(stale.provider)} before posting to it.`, "needs_reconnect");
  checkCaption(body.caption, accounts.map((a) => a.provider));

  const at = body.when === "now" ? now : checkTime(body.when, now);
  const video = await ownedVideo(userId, body.source);

  const cap = userDailyPostCap();
  if ((await postsInLastDay(userId)) + accounts.length > cap) {
    throw new PostError(429, `You can schedule up to ${cap} posts a day. Try again tomorrow.`, "post_limit");
  }

  // The same video to the same account at the same minute is a double tap.
  const minute = new Date(Math.floor(at.getTime() / MIN) * MIN);
  const dup = await prisma.clipPublish.findFirst({
    where: {
      userId, clipId: video.clipId, assetId: video.assetId, socialAccountId: { in: ids },
      status: { in: ["pending", "publishing"] },
      scheduledFor: { gte: new Date(minute.getTime() - MIN), lt: new Date(minute.getTime() + 2 * MIN) },
    },
    select: { id: true },
  });
  if (dup) throw new PostError(409, "This video is already set to post there at that time.", "duplicate");

  const rows = await prisma.$transaction(
    accounts.map((a) =>
      prisma.clipPublish.create({
        data: {
          userId,
          clipId: video.clipId,
          assetId: video.assetId,
          socialAccountId: a.id,
          title: body.title || null,
          caption: body.caption.trim() || null,
          hashtags: body.hashtags,
          privacy: body.privacy,
          source: "app",
          scheduledFor: at,
          status: body.when === "now" && !AUTO_PUBLISH_PROVIDERS.has(a.provider) ? "awaiting_manual" : "pending",
        },
        include: POST_INCLUDE,
      }),
    ),
  );

  const youtube = accounts.some((a) => AUTO_PUBLISH_PROVIDERS.has(a.provider));
  const warnings: ("not_short" | "uploads_busy")[] = [];
  if (youtube && !video.isShort) warnings.push("not_short");
  if (youtube && body.when === "now" && (await uploadsFullToday())) warnings.push("uploads_busy");
  if (body.when === "now") for (const r of rows) if (isAuto(r)) await enqueuePost(r.id);

  return { posts: await Promise.all(rows.map((r) => toPost(r, now))), warnings };
}

// ── Change, cancel, retry, link ──────────────────────────────────────────────

export async function updatePost(userId: string, id: string, body: UpdatePostRequest): Promise<SocialPost> {
  const now = new Date();
  const row = await getPost(userId, id);
  if (postStatus(row, now) !== "scheduled") throw new PostError(409, "This post has already started, so it can’t be changed.", "not_editable");
  if (body.caption !== undefined) checkCaption(body.caption, [row.socialAccount.provider]);
  const data: Prisma.ClipPublishUpdateInput = {};
  if (body.title !== undefined) data.title = body.title || null;
  if (body.caption !== undefined) data.caption = body.caption.trim() || null;
  if (body.hashtags !== undefined) data.hashtags = body.hashtags;
  if (body.privacy !== undefined) data.privacy = body.privacy;
  if (body.scheduledAt !== undefined) data.scheduledFor = checkTime(body.scheduledAt, now);
  // Only while still pending: the scheduler may have claimed it since the read.
  const changed = await prisma.clipPublish.updateMany({ where: { id, userId, status: "pending", scheduledFor: { gt: now } }, data: data as Prisma.ClipPublishUpdateManyMutationInput });
  if (changed.count === 0) throw new PostError(409, "This post has already started, so it can’t be changed.", "not_editable");
  return toPost(await getPost(userId, id), now);
}

/**
 * Cancels a post that hasn't started, or removes a finished one from Clipiro.
 * Never touches the post on the platform.
 */
export async function deletePost(userId: string, id: string): Promise<void> {
  const row = await getPost(userId, id);
  if (row.status === "publishing") throw new PostError(409, "This post is uploading right now. Try again in a minute.", "posting");
  const gone = await prisma.clipPublish.deleteMany({ where: { id, userId, status: { not: "publishing" } } });
  if (gone.count === 0) throw new PostError(409, "This post is uploading right now. Try again in a minute.", "posting");
}

/** A failed or missed post, again now. */
export async function retryPost(userId: string, id: string): Promise<SocialPost> {
  const now = new Date();
  const row = await getPost(userId, id);
  if (row.status !== "failed" && row.status !== "expired") throw new PostError(409, "Only a failed or missed post can be retried.", "not_retryable");
  const account = await prisma.socialAccount.findUnique({ where: { id: row.socialAccountId }, select: { status: true } });
  if (account?.status !== "active") throw new PostError(409, `Reconnect ${providerName(row.socialAccount.provider)} first, then retry.`, "needs_reconnect");
  const auto = isAuto(row);
  const moved = await prisma.clipPublish.updateMany({
    where: { id, userId, status: { in: ["failed", "expired"] } },
    data: { status: auto ? "pending" : "awaiting_manual", scheduledFor: now, failureReason: null },
  });
  if (moved.count === 0) throw new PostError(409, "Only a failed or missed post can be retried.", "not_retryable");
  if (auto) await enqueuePost(id);
  return toPost(await getPost(userId, id), now);
}

/** "I posted it": the live post's link, so the Social Tracker can pull its numbers. */
export async function linkPost(userId: string, id: string, permalink: string): Promise<SocialPost> {
  const row = await getPost(userId, id);
  if (row.status === "publishing") throw new PostError(409, "This post is uploading right now.", "posting");
  if (row.status === "linked") throw new PostError(409, "This post already has its link.", "already_linked");
  const providerPostId = await resolveProviderPostId(row.socialAccount, permalink);
  // Conditional: the scheduler may have started uploading it since the read.
  const linked = await prisma.clipPublish.updateMany({
    where: { id, userId, status: { notIn: ["publishing", "linked"] } },
    data: { status: "linked", permalink, providerPostId, publishedAt: new Date(), failureReason: null },
  });
  if (linked.count === 0) throw new PostError(409, "This post is uploading right now.", "posting");
  return toPost(await getPost(userId, id));
}
