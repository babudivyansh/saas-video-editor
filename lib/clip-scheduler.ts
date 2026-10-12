// Publishes posts whose scheduled time has arrived (cron /api/cron/clip-publish,
// every 10 minutes).
//
// ClipPublish.scheduledFor has existed (and been written by the publish route)
// since the column was added, but nothing ever read it — a scheduled post sat
// at status "pending" forever. This is the worker that makes the field mean
// something. Since mobile Phase 11.3 it also posts the Social Studio's posts
// (clips or videos from Assets) and is the fallback for "post now" posts whose
// queue job was lost (lib/social/publish-queue.ts).
//
// Posting itself lives in lib/social/publish.ts: YouTube is uploaded; for
// Instagram and Facebook, which have no publishing code, a due post becomes
// the person's turn to post rather than silently doing nothing.

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AUTO_PUBLISH_PROVIDERS, notifyPost, POST_INCLUDE, runPost } from "@/lib/social/publish";

export { AUTO_PUBLISH_PROVIDERS };

/** How far past its time a scheduled post is still worth publishing. */
const MAX_LATENESS_HOURS = 24;

export interface SchedulerResult {
  published: number;
  reminded: number;
  failed: number;
  skipped: number;
}

/** How long a "publishing" claim may be held before it is presumed dead. */
export const STALE_PUBLISHING_HOURS = 2;

const STALE_REASON = "We couldn't confirm this upload finished. Check your YouTube channel before posting it again.";
const MISSED_REASON = "This post couldn't go out within a day of its time, so it wasn't posted. Retry it or pick a new time.";

export async function publishDueClips(limit = 25): Promise<SchedulerResult> {
  const now = new Date();
  const earliest = new Date(now.getTime() - MAX_LATENESS_HOURS * 3600 * 1000);

  const due = await prisma.clipPublish.findMany({
    where: { status: "pending", scheduledFor: { not: null, lte: now, gte: earliest } },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const result: SchedulerResult = { published: 0, reminded: 0, failed: 0, skipped: 0 };
  for (const row of due) {
    const outcome = await runPost(row.id);
    if (outcome === "published") result.published++;
    else if (outcome === "reminded") result.reminded++;
    else if (outcome === "failed") result.failed++;
    else result.skipped++; // claimed elsewhere, still rendering, or today's uploads used up
  }

  // A "publishing" claim is taken right before an upload that takes minutes.
  // One still held long after it started means the process died mid-upload
  // (a restart, an OOM) and nothing will ever finish it. It is failed, not put
  // back to pending: the upload may well have reached YouTube before the
  // crash, and retrying it would post the clip twice.
  const claimCutoff = new Date(now.getTime() - STALE_PUBLISHING_HOURS * 3600 * 1000);
  const stuck = await prisma.clipPublish.findMany({
    where: {
      status: "publishing",
      OR: [
        { scheduledFor: { lt: claimCutoff } },
        { scheduledFor: null, createdAt: { lt: claimCutoff } },
      ],
    },
    include: POST_INCLUDE,
    take: 100,
  });
  if (stuck.length > 0) {
    await prisma.clipPublish.updateMany({
      where: { id: { in: stuck.map((r) => r.id) }, status: "publishing" },
      data: { status: "failed", failureReason: STALE_REASON },
    });
    for (const r of stuck) await notifyPost(r, "social_post_failed", STALE_REASON);
    logger.warn("clip-scheduler", `failed ${stuck.length} publish claim(s) abandoned mid-upload`);
  }

  // A post that slipped past the lateness window is stale — publishing a
  // "best time to post" clip a day late is worse than not publishing it.
  const missed = await prisma.clipPublish.findMany({
    where: { status: "pending", scheduledFor: { not: null, lt: earliest } },
    include: POST_INCLUDE,
    take: 100,
  });
  if (missed.length > 0) {
    await prisma.clipPublish.updateMany({
      where: { id: { in: missed.map((r) => r.id) }, status: "pending" },
      data: { status: "expired", failureReason: MISSED_REASON },
    });
    for (const r of missed) await notifyPost(r, "social_post_failed", MISSED_REASON);
    logger.info("clip-scheduler", `expired ${missed.length} scheduled publish(es) past the ${MAX_LATENESS_HOURS}h window`);
  }

  return result;
}
