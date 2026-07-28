// Async content moderation for review attachments, structurally identical to
// lib/asset-moderation.ts — same Rekognition pipeline, same queue mechanism,
// deliberately not a copy-paste-and-diverge: any fix there should be checked
// here too. The one behavioral difference: a flagged attachment auto-hides
// its parent review and notifies admins (attachments are a stronger abuse
// vector than text, so this fails closed), whereas a flagged Asset just gets
// a status flag for the owner to see.

import { DetectModerationLabelsCommand } from "@aws-sdk/client-rekognition";
import { Prisma } from "@prisma/client";
import { rekognition } from "@/lib/reframe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createRenderQueue } from "@/lib/render-queue";
import { generateVideoThumbnail } from "@/lib/asset-thumbnail";
import { notifyAdmins } from "@/lib/notify";
import { extensionForMime } from "@/utils/s3-upload";

const FLAG_CONFIDENCE_THRESHOLD = 80;

export interface ReviewAttachmentModerationPayload {
  // Satisfies createRenderQueue<T extends { projectId: string }>'s progress-
  // tracking key requirement — this queue tracks by attachmentId, so
  // projectId is always set to attachmentId here, not a real Project id.
  projectId: string;
  attachmentId: string;
  reviewId: string;
  userId: string;
  s3Key: string;
  mimeType: string;
  kind: "image" | "video";
}

interface ModerationLabel { name: string; confidence: number }

async function detectModerationLabelsForKey(key: string): Promise<ModerationLabel[]> {
  const res = await rekognition.send(new DetectModerationLabelsCommand({
    Image: { S3Object: { Bucket: env.AWS_S3_BUCKET, Name: key } },
    MinConfidence: 60,
  }));
  return (res.ModerationLabels ?? [])
    .filter((l) => l.Name && typeof l.Confidence === "number")
    .map((l) => ({ name: l.Name!, confidence: l.Confidence! }));
}

async function flagParentReview(reviewId: string, labels: ModerationLabel[]): Promise<void> {
  const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { status: true } });
  if (!review || review.status === "hidden") return;
  await prisma.review.update({ where: { id: reviewId }, data: { status: "hidden" } });
  await notifyAdmins(
    "admin_review_spam_detected",
    "A review was auto-hidden — a flagged attachment",
    labels.map((l) => l.name).join(", "),
    `/admin/reviews/${reviewId}`,
  ).catch((e) => logger.warn("review-attachment-moderation", `notifyAdmins failed for review ${reviewId}`, { reason: (e as Error).message }));
}

export async function reviewAttachmentModerationJob(payload: ReviewAttachmentModerationPayload): Promise<void> {
  const { attachmentId, reviewId, s3Key, mimeType, kind } = payload;

  try {
    let scanKey = s3Key;
    let thumbnailS3Key: string | null = null;

    if (kind === "video") {
      thumbnailS3Key = await generateVideoThumbnail(payload.userId, attachmentId, s3Key, extensionForMime(mimeType));
      if (!thumbnailS3Key) {
        // Couldn't extract a frame to scan — don't block the attachment on
        // it, but don't silently call it "clean" either.
        await prisma.reviewAttachment.update({ where: { id: attachmentId }, data: { moderationStatus: "skipped" } });
        return;
      }
      scanKey = thumbnailS3Key;
    }

    const labels = await detectModerationLabelsForKey(scanKey);
    const maxConfidence = labels.reduce((m, l) => Math.max(m, l.confidence), 0);
    const flagged = maxConfidence >= FLAG_CONFIDENCE_THRESHOLD;

    await prisma.reviewAttachment.update({
      where: { id: attachmentId },
      data: {
        moderationStatus: flagged ? "flagged" : "clean",
        moderationLabels: { labels } as unknown as Prisma.InputJsonValue,
        ...(thumbnailS3Key ? { thumbnailS3Key } : {}),
      },
    });

    if (flagged) {
      await flagParentReview(reviewId, labels);
    }
  } catch (e) {
    // Never let a moderation failure (missing Rekognition permission, region
    // mismatch, transient AWS error) block the review from displaying its
    // own attachment — fall back to "skipped", logged for operator follow-up.
    logger.warn("review-attachment-moderation", `moderation scan failed for attachment ${attachmentId}`, { reason: (e as Error).message });
    await prisma.reviewAttachment.update({
      where: { id: attachmentId },
      data: { moderationStatus: "skipped" },
    }).catch(() => { /* best-effort */ });
  }
}

export const reviewAttachmentModerationQueue = createRenderQueue<ReviewAttachmentModerationPayload>(
  "review-attachment-moderation",
  reviewAttachmentModerationJob,
);

export function enqueueReviewAttachmentModeration(payload: Omit<ReviewAttachmentModerationPayload, "projectId">): void {
  reviewAttachmentModerationQueue.enqueue(payload.attachmentId, { ...payload, projectId: payload.attachmentId });
}
