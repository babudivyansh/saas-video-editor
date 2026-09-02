// Publishes clips whose scheduled time has arrived.
//
// ClipPublish.scheduledFor has existed (and been written by the publish route)
// since the column was added, but nothing ever read it — a scheduled post sat
// at status "pending" forever. This is the worker that makes the field mean
// something.
//
// It deliberately does NOT add new publish destinations. YouTube has real
// programmatic upload (lib/social/google.ts); Instagram and Facebook do not —
// lib/social/meta.ts has no publish function at all, and adding one needs
// write scopes plus Meta app review and business verification. For those, a
// due post becomes a reminder rather than silently doing nothing.

import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/utils/download";
import { getValidAccessToken } from "@/lib/social/service";
import { uploadVideo as uploadToYouTube, NeedsReauthError } from "@/lib/social/google";
import { logger } from "@/lib/logger";
import os from "os";
import path from "path";
import fs from "fs";

/** Providers we can actually publish to without human involvement. */
export const AUTO_PUBLISH_PROVIDERS = new Set(["youtube"]);

/** How far past its time a scheduled post is still worth publishing. */
const MAX_LATENESS_HOURS = 24;

export interface SchedulerResult {
  published: number;
  reminded: number;
  failed: number;
  skipped: number;
}

export async function publishDueClips(limit = 25): Promise<SchedulerResult> {
  const now = new Date();
  const earliest = new Date(now.getTime() - MAX_LATENESS_HOURS * 3600 * 1000);

  const due = await prisma.clipPublish.findMany({
    where: {
      status: "pending",
      scheduledFor: { not: null, lte: now, gte: earliest },
    },
    include: {
      clip: { select: { id: true, title: true, videoUrl: true, status: true } },
      // The whole row: getValidAccessToken needs the encrypted tokens and
      // expiry to decide whether to refresh before using them.
      socialAccount: true,
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const result: SchedulerResult = { published: 0, reminded: 0, failed: 0, skipped: 0 };

  for (const row of due) {
    // The clip may still be rendering, or have failed, since it was scheduled.
    if (row.clip.status !== "ready" || !row.clip.videoUrl) {
      result.skipped++;
      continue;
    }
    if (row.socialAccount.status !== "active") {
      await markFailed(row.id, "The connected account needs to be reconnected before we can post.");
      result.failed++;
      continue;
    }

    if (!AUTO_PUBLISH_PROVIDERS.has(row.socialAccount.provider)) {
      // Honest behaviour for providers we can't post to: tell the user it's
      // time, rather than leaving a row that looks scheduled and never fires.
      await prisma.clipPublish.update({
        where: { id: row.id },
        data: { status: "awaiting_manual" },
      }).catch(() => {});
      result.reminded++;
      continue;
    }

    const tmpPath = path.join(os.tmpdir(), `sched-${row.id}.mp4`);
    try {
      await downloadFile(row.clip.videoUrl, tmpPath);
      const accessToken = await getValidAccessToken(row.socialAccount);
      const uploaded = await uploadToYouTube(accessToken, {
        buffer: fs.readFileSync(tmpPath),
        title: row.clip.title ?? "Clip",
        description: "Published via Clipiro AutoClip",
        privacyStatus: "public",
      });
      await prisma.clipPublish.update({
        where: { id: row.id },
        data: {
          status: "linked",
          providerPostId: uploaded.videoId,
          permalink: `https://www.youtube.com/watch?v=${uploaded.videoId}`,
          publishedAt: new Date(),
        },
      });
      result.published++;
    } catch (err) {
      const needsReauth = err instanceof NeedsReauthError;
      await markFailed(
        row.id,
        needsReauth
          ? "Reconnect your YouTube account to allow uploads, then reschedule."
          : "We couldn't publish this clip. It's still available to post manually.",
      );
      logger.error("clip-scheduler", `scheduled publish failed for ${row.id}`, err);
      result.failed++;
    } finally {
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    }
  }

  // A post that slipped past the lateness window is stale — publishing a
  // "best time to post" clip a day late is worse than not publishing it.
  const expired = await prisma.clipPublish.updateMany({
    where: { status: "pending", scheduledFor: { not: null, lt: earliest } },
    data: { status: "expired" },
  });
  if (expired.count > 0) {
    logger.info("clip-scheduler", `expired ${expired.count} scheduled publish(es) past the ${MAX_LATENESS_HOURS}h window`);
  }

  return result;
}

async function markFailed(id: string, reason: string): Promise<void> {
  // metricsJson belongs to the social-metrics refresh (lib/social/refresh-queue
  // owns it, and score-performance reads `views` out of it). Writing a failure
  // reason into it meant a failed publish looked to those consumers like a post
  // with no metrics, and the next refresh would overwrite the reason anyway.
  // failureReason has its own column now.
  await prisma.clipPublish.update({
    where: { id },
    data: { status: "failed", failureReason: reason },
  }).catch(() => {});
}
